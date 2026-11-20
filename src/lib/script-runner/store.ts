import { hostname } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runIdInput } from './schemas';
import { openEnvironment, sealEnvironment } from './environment';
import {
  ScriptRunnerRun,
  ScriptRunnerScript,
  ScriptRunnerSettings,
  type RunRecord,
  type ScriptRecord,
} from '@/models/ScriptRunner';
import {
  DEFAULT_RETENTION_DAYS,
  type RunnerOverview,
  type SavedScript,
  type ScriptDraft,
  type ScriptLanguage,
  type ScriptRun,
  type ScriptSummary,
} from '@/modules/script-runner/types';

export const runnerHost = hostname();
export const supported = process.platform === 'linux';
export const ACTIVE_STATUSES = ['queued', 'running'] as const;
export const WORKER_STALE_MS = 20_000;
export const runnerDataDirectory = '/var/lib/servermon/script-runner';
export const outputPath = (id: string) =>
  join(runnerDataDirectory, `${runIdInput.parse(id)}.ndjson`);
export const resultPath = (id: string) =>
  join(runnerDataDirectory, `${runIdInput.parse(id)}.result.json`);
const historySize = 30;

export function runResponse(run: RunRecord): ScriptRun {
  return {
    id: run._id,
    scriptId: run.scriptId,
    title: run.title,
    language: run.language ?? 'bash',
    cwd: run.cwd,
    args: run.args,
    timeoutSeconds: run.timeoutSeconds,
    status: run.status,
    requestedBy: run.requestedBy,
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt?.toISOString(),
    finishedAt: run.finishedAt?.toISOString(),
    exitCode: run.exitCode,
    signal: run.signal,
    message: run.message,
    stopRequestedAt: run.stopRequestedAt?.toISOString(),
    outputTruncated: run.outputTruncated,
    logsPurgedAt: run.logsPurgedAt?.toISOString(),
  };
}

function scriptSummary(script: ScriptRecord): ScriptSummary {
  return {
    id: script._id,
    title: script.title,
    language: script.language ?? 'bash',
    cwd: script.cwd,
    updatedAt: script.updatedAt.toISOString(),
  };
}

export function scriptResponse(script: ScriptRecord): SavedScript {
  return {
    ...scriptSummary(script),
    source: script.source,
    env: openEnvironment(script.environmentSeal),
    args: script.args,
    timeoutSeconds: script.timeoutSeconds,
  };
}

export function runnerSettings() {
  return ScriptRunnerSettings.findById(runnerHost).lean();
}

export function workerOnline(seenAt?: Date) {
  return supported && !!seenAt && Date.now() - seenAt.getTime() < WORKER_STALE_MS;
}

export function workerCapabilities(settings: Awaited<ReturnType<typeof runnerSettings>>) {
  if (settings?.workerId && settings.workerCapabilityId === settings.workerId) {
    return {
      protocol: settings.workerProtocol ?? 1,
      runtimes: settings.workerRuntimes ?? (['bash'] satisfies ScriptLanguage[]),
    };
  }
  return { protocol: 1, runtimes: ['bash'] satisfies ScriptLanguage[] };
}

export async function overview(before?: string): Promise<RunnerOverview> {
  const cursor = before
    ? await ScriptRunnerRun.findOne({ _id: before, host: runnerHost }).select('createdAt').lean()
    : null;
  const terminal = { host: runnerHost, status: { $nin: ACTIVE_STATUSES } };
  const [scripts, active, history, settings, recentRuns] = await Promise.all([
    ScriptRunnerScript.find({ host: runnerHost })
      .select('title language cwd updatedAt')
      .sort({ title: 1 })
      .lean(),
    ScriptRunnerRun.find({ host: runnerHost, status: { $in: ACTIVE_STATUSES } })
      .sort({ createdAt: 1, _id: 1 })
      .lean(),
    ScriptRunnerRun.find({
      ...terminal,
      ...(cursor && {
        $or: [
          { createdAt: { $lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, _id: { $lt: cursor._id } },
        ],
      }),
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(historySize + 1)
      .lean(),
    runnerSettings(),
    ScriptRunnerRun.find({ host: runnerHost })
      .select('cwd')
      .sort({ createdAt: -1 })
      .limit(60)
      .lean(),
  ]);
  const capabilities = workerCapabilities(settings);
  const online = workerOnline(settings?.workerSeenAt);
  return {
    scripts: scripts.map(scriptSummary),
    active: active.map(runResponse),
    history: history.slice(0, historySize).map(runResponse),
    nextHistoryCursor: history.length > historySize ? history[historySize - 1]._id : undefined,
    recentDirectories: [...new Set(recentRuns.map((run) => run.cwd))].slice(0, 6),
    online,
    supported,
    runtimes: online ? capabilities.runtimes : [],
    environmentSupport: capabilities.protocol >= 2,
    logRetentionDays: settings?.logRetentionDays ?? DEFAULT_RETENTION_DAYS,
  };
}

export function findRun(id: string) {
  return ScriptRunnerRun.findOne({ _id: id, host: runnerHost });
}

export function findScript(id: string) {
  return ScriptRunnerScript.findOne({ _id: id, host: runnerHost });
}

export function storedDraft({
  env,
  ...draft
}: Omit<ScriptDraft, 'language' | 'env'> & Partial<Pick<ScriptDraft, 'language' | 'env'>>) {
  return env === undefined ? draft : { ...draft, environmentSeal: sealEnvironment(env) };
}

export async function storeScript(draft: ScriptDraft) {
  const script = await ScriptRunnerScript.create({
    ...storedDraft(draft),
    _id: randomUUID(),
    host: runnerHost,
  });
  return scriptResponse(script);
}

export async function requestStop(id: string) {
  const now = new Date();
  const queued = await findRun(id)
    .findOneAndUpdate(
      { status: 'queued' },
      { $set: { status: 'stopped', finishedAt: now, stopRequestedAt: now } },
      { returnDocument: 'after' }
    )
    .lean();
  if (queued) return runResponse(queued);

  const running = await findRun(id)
    .findOneAndUpdate(
      { status: 'running', stopRequestedAt: null },
      { $set: { stopRequestedAt: now } },
      { returnDocument: 'after' }
    )
    .lean();
  const run = running ?? (await findRun(id).lean());
  return run ? runResponse(run) : null;
}
