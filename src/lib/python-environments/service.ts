import { randomUUID } from 'node:crypto';
import {
  PythonEnvironment,
  PythonEnvironmentWorker,
  PythonInterpreterInstallJob,
  type PythonEnvironmentRecord,
  type PythonRevisionRecord,
} from '@/models/PythonEnvironment';
import { ScriptRunnerRun, ScriptRunnerScript } from '@/models/ScriptRunner';
import { ACTIVE_STATUSES } from '@/lib/script-runner/store';
import { withLinkMutation } from '@/lib/script-runner/variables';
import type { PythonRevision } from '@/modules/python-environments/types';
import { pythonEnvironmentHost as host } from './references';
import { pythonBuildSupported } from './host';
import { normalizeRequirements, PythonEnvironmentError } from './requirements';

export const BUILD_STAGES = ['queued', 'creating', 'installing', 'checking'] as const;
export const INTERRUPTED_STAGES = ['creating', 'installing', 'checking'] as const;
export const supported = pythonBuildSupported;
const HISTORY_LIMIT = 16;
const HEARTBEAT_MAX_AGE = 30_000;

function revisionResponse(
  revision: PythonRevisionRecord,
  includeDetails = false,
  includePackages = false
): PythonRevision {
  return {
    id: revision.id,
    stage: revision.stage,
    createdAt: revision.createdAt.toISOString(),
    finishedAt: revision.finishedAt?.toISOString(),
    pythonVersion: revision.pythonVersion,
    diskBytes: revision.diskBytes,
    packageCount: revision.packageCount,
    error: revision.error,
    ...(includeDetails && {
      requirements: revision.requirements,
      log: revision.log,
    }),
    ...(includePackages && { packages: revision.packages }),
  };
}

function summary(record: PythonEnvironmentRecord, scriptsCount: number) {
  const active = record.revisions.find(({ id }) => id === record.activeRevisionId);
  const latest = record.revisions.at(-1);
  return {
    id: record._id,
    name: record.name,
    interpreterId: record.interpreterId,
    scriptsCount,
    active: active && revisionResponse(active),
    latest: latest && revisionResponse(latest),
    diskBytes: record.revisions.reduce((sum, { diskBytes }) => sum + (diskBytes ?? 0), 0),
    deleting: record.deleting,
    deleteError: record.deleteError,
  };
}

async function workerStatus() {
  const worker = await PythonEnvironmentWorker.findById(host).lean();
  const fresh = supported && !!worker && Date.now() - worker.seenAt.getTime() < HEARTBEAT_MAX_AGE;
  return {
    supported,
    online: fresh && !worker.error,
    interpreters: fresh ? worker.interpreters : [],
    workerError: fresh ? worker.error : undefined,
  };
}

async function requireInterpreter(interpreterId: string) {
  const worker = await workerStatus();
  if (!worker.online)
    throw new PythonEnvironmentError(
      worker.workerError ?? 'The Linux Python build worker is offline.',
      503
    );
  if (!worker.interpreters.some(({ id }) => id === interpreterId)) {
    throw new PythonEnvironmentError('The selected Python interpreter is unavailable.', 422);
  }
}

export async function environmentOverview() {
  const [records, counts, status, installs] = await Promise.all([
    PythonEnvironment.find({ host })
      .select('-revisions.log -revisions.requirements -revisions.packages')
      .sort({ nameKey: 1 })
      .lean(),
    ScriptRunnerScript.aggregate<{ _id: string; count: number }>([
      { $match: { host, pythonEnvironmentId: { $type: 'string' } } },
      { $group: { _id: '$pythonEnvironmentId', count: { $sum: 1 } } },
    ]),
    workerStatus(),
    PythonInterpreterInstallJob.find({ host, status: { $ne: 'ready' } })
      .select('version status error')
      .sort({ requestedAt: -1 })
      .limit(20)
      .lean(),
  ]);
  const byId = new Map(counts.map(({ _id, count }) => [_id, count]));
  return {
    ...status,
    environments: records.map((record) => summary(record, byId.get(record._id) ?? 0)),
    interpreterInstalls: installs.map(({ version, status, error }) => ({ version, status, error })),
  };
}

export async function queueInterpreterInstall(version: string) {
  const worker = await workerStatus();
  if (!worker.online)
    throw new PythonEnvironmentError('The Linux Python build worker is offline.', 503);
  if (worker.interpreters.some(({ id }) => id === `uv-${version}`)) return { version };
  try {
    await PythonInterpreterInstallJob.updateOne(
      { _id: `${host}:${version}`, status: { $nin: ['queued', 'installing'] } },
      {
        $set: { host, version, status: 'queued', requestedAt: new Date() },
        $unset: { error: 1, finishedAt: 1 },
      },
      { upsert: true }
    );
  } catch (error) {
    // Duplicate submissions target the same active job.
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000))
      throw error;
  }
  return { version };
}

export async function environmentDetail(id: string) {
  const [record, scripts] = await Promise.all([
    PythonEnvironment.findOne({ host, _id: id }).lean(),
    ScriptRunnerScript.find({ host, pythonEnvironmentId: id })
      .select('title schedule.enabled')
      .sort({ title: 1 })
      .lean(),
  ]);
  if (!record) throw new PythonEnvironmentError('Python environment not found.', 404);
  return {
    ...summary(record, scripts.length),
    requirements: record.revisions.at(-1)?.requirements ?? '',
    revisions: record.revisions
      .map((revision) => revisionResponse(revision, true, revision.id === record.activeRevisionId))
      .reverse(),
    consumers: scripts.map((script) => ({
      id: script._id,
      title: script.title,
      scheduled: !!script.schedule?.enabled,
    })),
  };
}

function queuedRevision(requirements: string): PythonRevisionRecord {
  return {
    id: randomUUID(),
    requirements: normalizeRequirements(requirements),
    stage: 'queued',
    createdAt: new Date(),
  };
}

export async function createEnvironment(name: string, interpreterId: string, requirements: string) {
  const revision = queuedRevision(requirements);
  await requireInterpreter(interpreterId);
  await PythonEnvironment.init();
  try {
    const id = randomUUID();
    await PythonEnvironment.create({
      _id: id,
      host,
      name,
      nameKey: name.toLowerCase(),
      interpreterId,
      revisions: [revision],
    });
    return { id };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      throw new PythonEnvironmentError('A Python environment already uses that name.', 409);
    }
    throw error;
  }
}

async function getEnvironment(id: string) {
  const environment = await PythonEnvironment.findOne({ host, _id: id }).lean();
  if (!environment) throw new PythonEnvironmentError('Python environment not found.', 404);
  return environment;
}

export async function buildEnvironment(id: string, requirements: string) {
  const revision = queuedRevision(requirements);
  await requireInterpreter((await getEnvironment(id)).interpreterId);
  return withLinkMutation(async () => {
    const environment = await getEnvironment(id);
    if (
      environment.deleting ||
      environment.revisions.some(({ stage }) => BUILD_STAGES.some((build) => build === stage))
    ) {
      throw new PythonEnvironmentError(
        'This environment already has an operation in progress.',
        409
      );
    }
    const slots = Math.max(0, environment.revisions.length - HISTORY_LIMIT + 1);
    const discard = environment.revisions
      .filter(({ stage }) => stage === 'pruned' || stage === 'failed')
      .slice(0, slots)
      .map(({ id }) => id);
    if (discard.length < slots) {
      throw new PythonEnvironmentError(
        'Too many revisions are still in use. Wait for the worker to prune unused revisions.',
        409
      );
    }
    if (discard.length) {
      await PythonEnvironment.updateOne(
        { host, _id: id },
        { $pull: { revisions: { id: { $in: discard } } } }
      );
    }
    await PythonEnvironment.updateOne({ host, _id: id }, { $push: { revisions: revision } });
    return { id };
  });
}

export async function restoreEnvironment(id: string, revisionId: string) {
  return withLinkMutation(async () => {
    const result = await PythonEnvironment.updateOne(
      {
        host,
        _id: id,
        deleting: { $ne: true },
        $and: [
          { revisions: { $elemMatch: { id: revisionId, stage: 'ready' } } },
          { revisions: { $not: { $elemMatch: { stage: { $in: BUILD_STAGES } } } } },
        ],
      },
      { $set: { activeRevisionId: revisionId } }
    );
    if (!result.matchedCount)
      throw new PythonEnvironmentError(
        'This revision is unavailable or a build is in progress.',
        409
      );
    return { id };
  });
}

export async function deleteEnvironment(id: string) {
  const worker = await workerStatus();
  if (!worker.online)
    throw new PythonEnvironmentError('The Linux Python build worker is offline.', 503);
  return withLinkMutation(async () => {
    const environment = await getEnvironment(id);
    if (environment.revisions.some(({ stage }) => BUILD_STAGES.some((build) => build === stage))) {
      throw new PythonEnvironmentError(
        'Wait for the current build before deleting this environment.',
        409
      );
    }
    const [saved, running] = await Promise.all([
      ScriptRunnerScript.exists({ host, pythonEnvironmentId: id }),
      ScriptRunnerRun.exists({
        host,
        'pythonEnvironment.environmentId': id,
        status: { $in: ACTIVE_STATUSES },
      }),
    ]);
    if (saved || running) {
      throw new PythonEnvironmentError(
        'Unlink this environment from saved scripts and wait for its active runs to finish.',
        409
      );
    }
    await PythonEnvironment.updateOne(
      { host, _id: id },
      { $set: { deleting: true }, $unset: { deleteError: 1 } }
    );
    return { id };
  });
}
