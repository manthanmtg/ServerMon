import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import connectDB from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { ScriptRunnerRun, ScriptRunnerSettings, type RunRecord } from '@/models/ScriptRunner';
import { DEFAULT_RETENTION_DAYS } from '@/modules/script-runner/types';
import { captureOutput } from './output';
import { findRun, outputPath, resultPath, runnerHost, runnerSettings, supported } from './store';
import { encodeLaunch, forgetUnit, inspectUnit, probeRunner, startUnit, stopUnit } from './systemd';

const log = createLogger('script-runner:worker');
const CONCURRENCY = 2;
const TICK_MS = 750;
const HEARTBEAT_MS = 5000;
const CLEANUP_MS = 60_000;
const PROBE_MS = 60_000;
const DAY_MS = 86_400_000;

type TerminalResult = Pick<RunRecord, 'exitCode' | 'signal' | 'message' | 'outputTruncated'> & {
  status: Exclude<RunRecord['status'], 'queued' | 'running'>;
  finishedAt: string;
};

interface Task {
  done: Promise<void>;
  stop?: Promise<boolean>;
  shutdown?: Promise<boolean>;
}

function finishResult(input: Omit<TerminalResult, 'finishedAt'>): TerminalResult {
  return { ...input, finishedAt: new Date().toISOString() };
}

function unitAlive(unit: Awaited<ReturnType<typeof inspectUnit>>) {
  return ['activating', 'active', 'deactivating', 'reloading'].includes(unit.state);
}

async function persistResult(id: string, result: TerminalResult, resetUnit: boolean) {
  await findRun(id).updateOne({ status: 'running' }, { $set: result });
  await rm(resultPath(id), { force: true });
  if (resetUnit) await forgetUnit(id).catch(() => undefined);
}

async function stopIfAlive(id: string) {
  try {
    if (!unitAlive(await inspectUnit(id))) return false;
    await stopUnit(id);
    return true;
  } catch (error) {
    log.warn('Could not stop script run yet', { id, error });
    return false;
  }
}

async function executeRun(run: RunRecord, task: Task) {
  const id = run._id;
  const child = startUnit(id, run.timeoutSeconds);
  const capturing = captureOutput(child, outputPath(id));
  child.stdin.on('error', () => {
    // A failed or stopped launch can close the input before the payload is sent.
  });
  child.stdin.end(encodeLaunch(run));
  const capture = await capturing;
  const [stopped, shutdown] = await Promise.all([task.stop, task.shutdown]);
  const unit = await inspectUnit(id).catch((error) => {
    log.warn('Could not inspect finished script unit', { id, error });
    return null;
  });
  if ((unit && unitAlive(unit)) || (!unit?.state && capture.code !== 0)) {
    // A failed systemd-run client does not prove the script service stopped.
    return;
  }
  const exitCode = unit?.exitCode ?? (unit?.signal || stopped || shutdown ? null : capture.code);
  const signal = unit?.signal ?? null;
  const result = finishResult({
    status:
      unit?.result === 'timeout'
        ? 'timed_out'
        : stopped
          ? 'stopped'
          : shutdown
            ? 'interrupted'
            : exitCode === 0 && !capture.error
              ? 'succeeded'
              : 'failed',
    exitCode,
    signal,
    message: capture.error ?? (capture.signal ? `Launcher received ${capture.signal}` : undefined),
    outputTruncated: capture.truncated,
  });
  const path = resultPath(id);
  try {
    await writeFile(`${path}.tmp`, JSON.stringify(result), { mode: 0o600 });
    await rename(`${path}.tmp`, path);
  } catch (error) {
    log.warn('Could not store the local script exit record', { id, error });
  }
  await persistResult(id, result, unit?.state === 'failed');
}

async function recoverRun(run: RunRecord) {
  const id = run._id;
  const saved = await readFile(resultPath(id), 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (saved) {
    const result = JSON.parse(saved) as TerminalResult;
    await persistResult(id, result, true);
    return;
  }

  const unit = await inspectUnit(id);
  if (!unit.state) throw new Error('Unable to determine the script unit state');
  if (unitAlive(unit)) {
    await stopUnit(id);
    if (unitAlive(await inspectUnit(id))) throw new Error('The script service is still stopping');
    await persistResult(
      id,
      finishResult({
        status: 'interrupted',
        message: 'The worker restarted and stopped the remaining script processes.',
      }),
      true
    );
    return;
  }
  const status =
    unit.result === 'timeout'
      ? 'timed_out'
      : unit.exitCode === 0
        ? 'succeeded'
        : unit.exitCode != null || unit.signal != null
          ? 'failed'
          : 'interrupted';
  await persistResult(
    id,
    finishResult({
      status,
      exitCode: unit.exitCode,
      signal: unit.signal,
      message:
        status === 'interrupted'
          ? 'The worker stopped before an exit result was recorded.'
          : undefined,
    }),
    unit.state === 'failed'
  );
}

async function cleanExpiredLogs(now: number) {
  const settings = await runnerSettings();
  const days = settings?.logRetentionDays ?? DEFAULT_RETENTION_DAYS;
  const expired = await ScriptRunnerRun.find({
    host: runnerHost,
    status: { $nin: ['queued', 'running'] },
    finishedAt: { $lte: new Date(now - days * DAY_MS) },
    logsPurgedAt: null,
  })
    .sort({ finishedAt: 1 })
    .limit(250)
    .select('_id')
    .lean();
  for (const run of expired) {
    await rm(outputPath(run._id), { force: true });
    await rm(resultPath(run._id), { force: true });
    await rm(`${resultPath(run._id)}.tmp`, { force: true });
    await findRun(run._id).updateOne(
      { logsPurgedAt: null },
      { $set: { logsPurgedAt: new Date() } }
    );
  }
}

export async function runWorker(signal: AbortSignal) {
  if (!supported) throw new Error('Script Runner requires Linux and systemd.');
  await connectDB();
  await probeRunner();
  const workerId = randomUUID();
  const tasks = new Map<string, Task>();
  let nextHeartbeat = 0;
  let nextCleanup = 0;
  let nextProbe = Date.now() + PROBE_MS;

  async function tick() {
    const running = await ScriptRunnerRun.find({ host: runnerHost, status: 'running' }).lean();
    let unreconciled = 0;
    for (const run of running) {
      const task = tasks.get(run._id);
      if (!task) {
        try {
          await recoverRun(run);
        } catch (error) {
          unreconciled++;
          log.warn('Could not recover script run yet', { id: run._id, error });
        }
      } else if (run.stopRequestedAt && !task.stop) {
        const stopping = stopIfAlive(run._id).then((stopped) => {
          if (!stopped && task.stop === stopping) task.stop = undefined;
          return stopped;
        });
        task.stop = stopping;
      }
    }

    if (signal.aborted) return;
    if (Date.now() >= nextProbe) {
      await probeRunner();
      nextProbe = Date.now() + PROBE_MS;
    }
    if (Date.now() >= nextHeartbeat) {
      await ScriptRunnerSettings.updateOne(
        { _id: runnerHost },
        { $set: { workerId, workerSeenAt: new Date() } },
        { upsert: true }
      );
      nextHeartbeat = Date.now() + HEARTBEAT_MS;
    }

    for (let free = CONCURRENCY - tasks.size - unreconciled; free > 0 && !signal.aborted; free--) {
      const run = await ScriptRunnerRun.findOneAndUpdate(
        { host: runnerHost, status: 'queued' },
        { $set: { status: 'running', startedAt: new Date() } },
        { sort: { createdAt: 1, _id: 1 }, returnDocument: 'after' }
      )
        .select('+source')
        .lean();
      if (!run) break;
      if (signal.aborted) break;
      const task: Task = { done: Promise.resolve() };
      tasks.set(run._id, task);
      task.done = executeRun(run, task)
        .catch((error) => log.error('Script run requires recovery', { id: run._id, error }))
        .finally(() => tasks.delete(run._id));
    }

    if (Date.now() >= nextCleanup) {
      nextCleanup = Date.now() + CLEANUP_MS;
      await cleanExpiredLogs(Date.now());
    }
  }

  try {
    while (!signal.aborted) {
      try {
        await tick();
      } catch (error) {
        log.error('Script Runner could not reconcile its queue', error);
      }
      if (!signal.aborted) await delay(TICK_MS, undefined, { signal }).catch(() => undefined);
    }
  } finally {
    const active = [...tasks.entries()];
    await Promise.allSettled([
      ScriptRunnerSettings.updateOne(
        { _id: runnerHost, workerId },
        { $unset: { workerSeenAt: 1 } }
      ),
      ...active.map(async ([id, task]) => {
        task.shutdown = stopIfAlive(id);
        await task.done;
      }),
    ]);
  }
}
