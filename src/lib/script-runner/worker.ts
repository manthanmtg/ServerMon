import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import connectDB from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { ScriptRunnerRun, ScriptRunnerSettings, type RunRecord } from '@/models/ScriptRunner';
import { DEFAULT_MAX_CONCURRENT_RUNS } from '@/modules/script-runner/types';
import { pruneRuns } from './retention';
import { enqueueDueSchedules } from './schedules';
import { captureOutput } from './output';
import { combineLaunchEnvironment, openEnvironment } from './environment';
import { QUEUED_STATUSES, findRun, outputPath, resultPath, runnerHost, supported } from './store';
import {
  encodeLaunch,
  forgetUnit,
  inspectUnit,
  probeRunner,
  startUnit,
  stopUnit,
  type RunnerCapabilities,
} from './systemd';

const log = createLogger('script-runner:worker');
const TICK_MS = 750;
const HEARTBEAT_MS = 5000;
const CLEANUP_MS = 60_000;
const PROBE_MS = 60_000;
const SCHEDULE_POLL_MS = 5000;

type TerminalResult = Pick<RunRecord, 'exitCode' | 'signal' | 'message' | 'outputTruncated'> & {
  status: Exclude<RunRecord['status'], 'queued' | 'queued_linked' | 'running'>;
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

async function executeRun(run: RunRecord, task: Task, capabilities: RunnerCapabilities) {
  const id = run._id;
  const language = run.language ?? 'bash';
  let env;
  try {
    env = combineLaunchEnvironment(
      openEnvironment(run.linkedEnvironmentSeal),
      openEnvironment(run.environmentSeal)
    ).env;
  } catch {
    await persistResult(
      id,
      finishResult({ status: 'failed', message: 'The run environment could not be decrypted.' }),
      false
    );
    return;
  }
  if (!capabilities.runtimes.includes(language) || (env.length > 0 && capabilities.protocol < 2)) {
    await persistResult(
      id,
      finishResult({
        status: 'failed',
        message: 'The script worker does not support this launch configuration.',
      }),
      false
    );
    return;
  }
  const payload = encodeLaunch({ ...run, language, env }, capabilities.protocol);
  const child = startUnit(id, run.timeoutSeconds);
  const capturing = captureOutput(child, outputPath(id));
  child.stdin.on('error', () => {
    // A failed or stopped launch can close the input before the payload is sent.
  });
  child.stdin.end(payload);
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

export async function runWorker(signal: AbortSignal) {
  if (!supported) throw new Error('Script Runner requires Linux and systemd.');
  await connectDB();
  let capabilities = await probeRunner();
  const workerId = randomUUID();
  const tasks = new Map<string, Task>();
  let nextHeartbeat = 0;
  let maxConcurrentRuns = DEFAULT_MAX_CONCURRENT_RUNS;
  let nextCleanup = 0;
  let nextSchedulePoll = 0;
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
      capabilities = await probeRunner();
      nextProbe = Date.now() + PROBE_MS;
    }
    if (Date.now() >= nextHeartbeat) {
      const settings = await ScriptRunnerSettings.findOneAndUpdate(
        { _id: runnerHost },
        {
          $set: {
            workerId,
            workerSeenAt: new Date(),
            workerCapabilityId: workerId,
            workerLinkedEnvironmentId: workerId,
            workerProtocol: capabilities.protocol,
            workerRuntimes: capabilities.runtimes,
          },
        },
        { upsert: true, returnDocument: 'after' }
      )
        .select('maxConcurrentRuns')
        .lean();
      maxConcurrentRuns = settings?.maxConcurrentRuns ?? DEFAULT_MAX_CONCURRENT_RUNS;
      nextHeartbeat = Date.now() + HEARTBEAT_MS;
    }

    for (
      let free = maxConcurrentRuns - tasks.size - unreconciled;
      free > 0 && !signal.aborted;
      free--
    ) {
      const run = await ScriptRunnerRun.findOneAndUpdate(
        { host: runnerHost, status: { $in: QUEUED_STATUSES } },
        { $set: { status: 'running', startedAt: new Date() } },
        { sort: { createdAt: 1, _id: 1 }, returnDocument: 'after' }
      )
        .select('+source +environmentSeal +linkedEnvironmentSeal')
        .lean();
      if (!run) break;
      if (signal.aborted) break;
      const task: Task = { done: Promise.resolve() };
      tasks.set(run._id, task);
      task.done = executeRun(run, task, capabilities)
        .catch((error) => log.error('Script run requires recovery', { id: run._id, error }))
        .finally(() => tasks.delete(run._id));
    }

    if (!signal.aborted && Date.now() >= nextSchedulePoll) {
      nextSchedulePoll = Date.now() + SCHEDULE_POLL_MS;
      await enqueueDueSchedules(new Date(), signal).catch((error) =>
        log.error('Script Runner could not check schedules', error)
      );
    }

    if (!signal.aborted && Date.now() >= nextCleanup) {
      nextCleanup = Date.now() + CLEANUP_MS;
      if (await pruneRuns(Date.now())) nextCleanup = Date.now() + SCHEDULE_POLL_MS;
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
