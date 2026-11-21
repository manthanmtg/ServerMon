import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import connectDB from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { ACTIVE_STATUSES } from '@/lib/script-runner/store';
import { withLinkMutation } from '@/lib/script-runner/variables';
import {
  PythonEnvironment,
  PythonEnvironmentWorker,
  PythonInterpreterInstallJob,
  type PythonEnvironmentRecord,
  type PythonRevisionRecord,
} from '@/models/PythonEnvironment';
import { ScriptRunnerRun } from '@/models/ScriptRunner';
import {
  buildRevision,
  installManagedPython,
  probeInterpreters,
  PythonBuildError,
  removeRevision,
} from './host';
import { pythonEnvironmentHost as host } from './references';
import { BUILD_STAGES, INTERRUPTED_STAGES, supported } from './service';

const log = createLogger('python-environments:worker');

export async function processPythonInterpreterInstall(signal: AbortSignal) {
  if (signal.aborted) return false;
  const job = await PythonInterpreterInstallJob.findOneAndUpdate(
    { host, status: { $in: ['queued', 'installing'] } },
    { $set: { status: 'installing' } },
    { sort: { requestedAt: 1 }, returnDocument: 'after' }
  ).lean();
  if (!job) return false;

  try {
    await installManagedPython(job.version, signal);
  } catch (error) {
    if (signal.aborted) return false;
    await PythonInterpreterInstallJob.updateOne(
      { _id: job._id, status: 'installing' },
      {
        $set: {
          status: 'failed',
          finishedAt: new Date(),
          error:
            error instanceof PythonBuildError && error.log
              ? error.log
              : 'Python interpreter installation failed.',
        },
      }
    );
    return false;
  }
  if (signal.aborted) return false;
  await PythonInterpreterInstallJob.updateOne(
    { _id: job._id, status: 'installing' },
    { $set: { status: 'ready', finishedAt: new Date() }, $unset: { error: 1 } }
  );
  return true;
}

function updateRevision(
  environmentId: string,
  revisionId: string,
  fields: Partial<PythonRevisionRecord>
) {
  return PythonEnvironment.updateOne(
    { host, _id: environmentId, 'revisions.id': revisionId },
    {
      $set: Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [`revisions.$.${key}`, value])
      ),
    }
  );
}

async function discardRevision(environmentId: string, revision: PythonRevisionRecord) {
  await removeRevision(environmentId, revision.id);
  await updateRevision(environmentId, revision.id, {
    stage: revision.pythonVersion ? 'pruned' : 'failed',
    diskBytes: 0,
    finishedAt: revision.finishedAt ?? new Date(),
  });
}

async function recoverBuild(environment: PythonEnvironmentRecord, revision: PythonRevisionRecord) {
  const error = 'The worker stopped during this build. Start a new build to retry.';
  await updateRevision(environment._id, revision.id, { stage: 'removing', error });
  await discardRevision(environment._id, revision);
}

export async function processPythonBuild(
  environment: PythonEnvironmentRecord,
  revision: PythonRevisionRecord,
  signal: AbortSignal
) {
  const claimed = await PythonEnvironment.updateOne(
    {
      host,
      _id: environment._id,
      deleting: { $ne: true },
      revisions: { $elemMatch: { id: revision.id, stage: 'queued' } },
    },
    { $set: { 'revisions.$.stage': 'creating' } }
  );
  if (!claimed.modifiedCount) return;
  let progress: Promise<unknown> = Promise.resolve();
  let result: Awaited<ReturnType<typeof buildRevision>>;
  try {
    result = await buildRevision(
      {
        environmentId: environment._id,
        revisionId: revision.id,
        interpreterId: environment.interpreterId,
        requirements: revision.requirements,
      },
      (stage, output) => {
        progress = progress
          .then(() => updateRevision(environment._id, revision.id, { stage, log: output }))
          .catch((error: unknown) => log.warn('Could not record build progress', error));
      },
      signal
    );
  } catch (error) {
    await progress;
    if (signal.aborted) return;
    log.warn('Python environment build failed', {
      environmentId: environment._id,
      revisionId: revision.id,
      error,
    });
    await updateRevision(environment._id, revision.id, {
      stage: 'removing',
      finishedAt: new Date(),
      error:
        error instanceof PythonBuildError
          ? error.message
          : 'The worker could not finish this build.',
      ...(error instanceof PythonBuildError && { log: error.log }),
    });
    await discardRevision(environment._id, revision);
    return;
  }
  await progress;
  if (signal.aborted) return;
  // Leave an uncertain publication to the next reconciliation. The commit may have succeeded.
  await PythonEnvironment.updateOne(
    {
      host,
      _id: environment._id,
      revisions: { $elemMatch: { id: revision.id, stage: { $in: INTERRUPTED_STAGES } } },
    },
    {
      $set: {
        activeRevisionId: revision.id,
        'revisions.$.stage': 'ready',
        'revisions.$.finishedAt': new Date(),
        'revisions.$.pythonVersion': result.pythonVersion,
        'revisions.$.packages': result.packages,
        'revisions.$.packageCount': result.packages.length,
        'revisions.$.diskBytes': result.diskBytes,
        'revisions.$.log': result.log,
      },
    }
  );
}

async function markExcessRevision(id: string) {
  return withLinkMutation(async () => {
    const environment = await PythonEnvironment.findOne({
      host,
      _id: id,
      deleting: { $ne: true },
    }).lean();
    if (
      !environment ||
      environment.revisions.some(({ stage }) => BUILD_STAGES.some((build) => build === stage))
    )
      return;
    const alternatives = environment.revisions.filter(
      ({ id, stage }) => stage === 'ready' && id !== environment.activeRevisionId
    );
    if (alternatives.length <= 1) return;
    const pinned = await ScriptRunnerRun.distinct('pythonEnvironment.revisionId', {
      host,
      'pythonEnvironment.environmentId': id,
      status: { $in: ACTIVE_STATUSES },
    });
    const candidate = alternatives.slice(0, -1).find((revision) => !pinned.includes(revision.id));
    if (!candidate) return;
    await updateRevision(id, candidate.id, { stage: 'removing' });
    return candidate;
  });
}

export async function reconcilePythonEnvironmentStorage(signal: AbortSignal) {
  const deleting = await PythonEnvironment.findOne({
    host,
    deleting: true,
    deleteError: null,
  }).lean();
  if (deleting) {
    try {
      for (const revision of deleting.revisions) {
        if (signal.aborted) return;
        if (revision.stage !== 'pruned' && revision.stage !== 'failed')
          await removeRevision(deleting._id, revision.id);
      }
      await PythonEnvironment.deleteOne({ host, _id: deleting._id, deleting: true });
    } catch (error) {
      log.warn('Environment files could not be removed', error);
      await PythonEnvironment.updateOne(
        { host, _id: deleting._id },
        { $set: { deleteError: 'Could not remove the environment. Retry deletion to continue.' } }
      );
    }
  }
  const records = await PythonEnvironment.find({
    host,
    deleting: { $ne: true },
    'revisions.stage': { $in: ['removing', 'ready'] },
  })
    .select(
      'activeRevisionId revisions.id revisions.stage revisions.finishedAt revisions.pythonVersion'
    )
    .lean();
  for (const record of records) {
    if (signal.aborted) return;
    const removing = record.revisions.find(({ stage }) => stage === 'removing');
    const count = record.revisions.filter(({ stage }) => stage === 'ready').length;
    const candidate = removing ?? (count > 2 ? await markExcessRevision(record._id) : undefined);
    if (candidate) {
      try {
        await discardRevision(record._id, candidate);
      } catch (error) {
        log.warn('Could not prune Python environment revision', {
          environmentId: record._id,
          revisionId: candidate.id,
          error,
        });
      }
    }
  }
}

export async function runPythonEnvironments(signal: AbortSignal) {
  if (!supported) return;
  await connectDB();
  const workerId = randomUUID();
  let interpreters: Awaited<ReturnType<typeof probeInterpreters>> = [];
  let workerError: string | undefined;
  let nextProbe = 0;
  let nextCleanup = 0;
  let heartbeats: Promise<void> = Promise.resolve();

  function heartbeat() {
    heartbeats = heartbeats
      .then(async () => {
        if (signal.aborted) return;
        if (Date.now() >= nextProbe) {
          nextProbe = Date.now() + 60_000;
          try {
            interpreters = await probeInterpreters(signal);
            workerError = undefined;
          } catch (error) {
            interpreters = [];
            workerError =
              'The Python environment build helper is unavailable. Check the worker installation.';
            if (!signal.aborted) log.warn('Python build helper probe failed', error);
          }
        }
        await PythonEnvironmentWorker.updateOne(
          { _id: host },
          {
            $set: {
              workerId,
              seenAt: new Date(),
              interpreters,
              ...(workerError && { error: workerError }),
            },
            ...(!workerError && { $unset: { error: 1 } }),
          },
          { upsert: true }
        );
      })
      .catch((error: unknown) =>
        log.warn('Could not refresh Python environment worker status', error)
      );
    return heartbeats;
  }

  await heartbeat();
  const timer = setInterval(() => void heartbeat(), 5_000);
  try {
    while (!signal.aborted) {
      try {
        if (!workerError) {
          const interrupted = await PythonEnvironment.findOne({
            host,
            'revisions.stage': { $in: INTERRUPTED_STAGES },
          }).lean();
          const pending = interrupted?.revisions.find(({ stage }) =>
            INTERRUPTED_STAGES.some((build) => build === stage)
          );
          if (interrupted && pending) await recoverBuild(interrupted, pending);
          if (Date.now() >= nextCleanup) {
            nextCleanup = Date.now() + 10_000;
            await reconcilePythonEnvironmentStorage(signal);
          }
          if (await processPythonInterpreterInstall(signal)) {
            nextProbe = 0;
            await heartbeat();
          }
          const environment = await PythonEnvironment.findOne({
            host,
            deleting: { $ne: true },
            'revisions.stage': 'queued',
          }).lean();
          const revision = environment?.revisions.find(({ stage }) => stage === 'queued');
          if (environment && revision && !signal.aborted)
            await processPythonBuild(environment, revision, signal);
        }
      } catch (error) {
        log.error('Could not reconcile Python environments', error);
      }
      if (!signal.aborted) await delay(2_000, undefined, { signal }).catch(() => undefined);
    }
  } finally {
    clearInterval(timer);
    await heartbeats;
    await PythonEnvironmentWorker.deleteOne({ _id: host, workerId }).catch((error: unknown) =>
      log.warn('Could not clear Python worker status', error)
    );
  }
}
