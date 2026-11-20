import { hostname } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runIdInput } from './schemas';
import { openEnvironment, sealEnvironment } from './environment';
import {
  ScriptRunnerRun,
  ScriptRunnerEnvGroup,
  ScriptRunnerScript,
  ScriptRunnerSettings,
  ScriptRunnerVariable,
  type RunRecord,
  type EnvGroupRecord,
  type ScriptRecord,
  type SettingsRecord,
  type VariableRecord,
} from '@/models/ScriptRunner';
import {
  SCRIPT_RUNNER_DEFAULTS,
  type SavedEnvGroup,
  type SavedEnvVariable,
  type ScriptRunnerDefaults,
  type RunnerOverview,
  type SavedScript,
  type ScriptDraft,
  type ScriptLanguage,
  type ScriptRun,
  type ScriptSummary,
} from '@/modules/script-runner/types';

export const runnerHost = hostname();
export const supported = process.platform === 'linux';
export const QUEUED_STATUSES = ['queued', 'queued_linked'] as const;
export const ACTIVE_STATUSES = [...QUEUED_STATUSES, 'running'] as const;
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
    status: run.status === 'queued_linked' ? 'queued' : run.status,
    requestedBy: run.requestedBy,
    scheduledFor: run.scheduledFor?.toISOString(),
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

export function scriptSummary(script: ScriptRecord): ScriptSummary {
  return {
    id: script._id,
    title: script.title,
    language: script.language ?? 'bash',
    cwd: script.cwd,
    folder: script.folder,
    updatedAt: script.updatedAt.toISOString(),
  };
}

export function scriptResponse(script: ScriptRecord): SavedScript {
  return {
    ...scriptSummary(script),
    source: script.source,
    env: openEnvironment(script.environmentSeal),
    envVarIds: script.envVarIds ?? [],
    envGroupIds: script.envGroupIds ?? [],
    args: script.args,
    timeoutSeconds: script.timeoutSeconds,
  };
}

export function runnerSettings() {
  return ScriptRunnerSettings.findById(runnerHost).lean();
}

export function runnerDefaults(
  settings?: Partial<ScriptRunnerDefaults> | null
): ScriptRunnerDefaults {
  return {
    defaultWorkingDirectory:
      settings?.defaultWorkingDirectory ?? SCRIPT_RUNNER_DEFAULTS.defaultWorkingDirectory,
    defaultTimeoutSeconds:
      settings?.defaultTimeoutSeconds ?? SCRIPT_RUNNER_DEFAULTS.defaultTimeoutSeconds,
    maxConcurrentRuns: settings?.maxConcurrentRuns ?? SCRIPT_RUNNER_DEFAULTS.maxConcurrentRuns,
    logRetentionDays: settings?.logRetentionDays ?? SCRIPT_RUNNER_DEFAULTS.logRetentionDays,
    historyRetentionDays:
      settings?.historyRetentionDays ?? SCRIPT_RUNNER_DEFAULTS.historyRetentionDays,
    maxHistoryRuns: settings?.maxHistoryRuns ?? SCRIPT_RUNNER_DEFAULTS.maxHistoryRuns,
  };
}

export function variableResponse(variable: VariableRecord): SavedEnvVariable {
  return {
    id: variable._id,
    key: variable.key,
    secret: variable.secret,
    updatedAt: variable.updatedAt.toISOString(),
  };
}

export function findVariable(id: string) {
  return ScriptRunnerVariable.findOne({ host: runnerHost, _id: id });
}

export function envGroupResponse(group: EnvGroupRecord): SavedEnvGroup {
  return { id: group._id, name: group.name, variableIds: group.variableIds };
}

export function findEnvGroup(id: string) {
  return ScriptRunnerEnvGroup.findOne({ _id: id, host: runnerHost });
}

export function workerOnline(seenAt?: Date) {
  return supported && !!seenAt && Date.now() - seenAt.getTime() < WORKER_STALE_MS;
}

export function workerCapabilities(settings: SettingsRecord | null) {
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
  const [scripts, active, history, settings, recentRuns, variables, oldestHistory, envGroups] =
    await Promise.all([
      ScriptRunnerScript.find({ host: runnerHost })
        .select('title language cwd folder updatedAt')
        .sort({ title: 1 })
        .lean(),
      ScriptRunnerRun.find({ host: runnerHost, status: { $in: ACTIVE_STATUSES } })
        .sort({ createdAt: 1, _id: 1 })
        .lean(),
      before && !cursor
        ? []
        : ScriptRunnerRun.find({
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
      ScriptRunnerVariable.find({ host: runnerHost })
        .select('key secret updatedAt')
        .sort({ key: 1 })
        .lean(),
      ScriptRunnerRun.findOne(terminal).sort({ createdAt: 1, _id: 1 }).select('createdAt').lean(),
      ScriptRunnerEnvGroup.find({ host: runnerHost })
        .select('name variableIds')
        .sort({ nameKey: 1 })
        .lean(),
    ]);
  const capabilities = workerCapabilities(settings);
  const online = workerOnline(settings?.workerSeenAt);
  return {
    ...runnerDefaults(settings),
    variables: variables.map(variableResponse),
    envGroups: envGroups.map(envGroupResponse),
    scripts: scripts.map(scriptSummary),
    active: active.map(runResponse),
    history: history.slice(0, historySize).map(runResponse),
    nextHistoryCursor: history.length > historySize ? history[historySize - 1]._id : undefined,
    oldestHistory: oldestHistory
      ? { id: oldestHistory._id, createdAt: oldestHistory.createdAt.toISOString() }
      : undefined,
    recentDirectories: [...new Set(recentRuns.map((run) => run.cwd))].slice(0, 6),
    online,
    supported,
    runtimes: online ? capabilities.runtimes : [],
    environmentSupport: capabilities.protocol >= 2,
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
      { status: { $in: QUEUED_STATUSES } },
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
