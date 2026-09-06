import connectDB from '@/lib/db';
import ManagedApp from '@/models/ManagedApp';
import AppOperation from '@/models/AppOperation';
import { enqueueAppOperation, AppsWorkerUnavailableError } from './application/enqueue-operation';
import { ActiveAppOperationError } from './repositories/operation-repository';
import { nextRetryAt } from './domain/auto-update-policy';

export interface GitAppAutoUpdateSummary {
  checked: number;
  queued: number;
  busy: number;
  blocked: number;
  failedToQueue: number;
}

function dueGitAppAutoUpdateQuery(before: Date) {
  return {
    sourceType: 'git',
    'autoUpdate.enabled': true,
    deletedAt: { $exists: false },
    $or: [{ 'autoUpdate.nextRunAt': null }, { 'autoUpdate.nextRunAt': { $lte: before } }],
  };
}

export async function countDueGitAppAutoUpdates(before = new Date()): Promise<number> {
  await connectDB();
  return ManagedApp.countDocuments(dueGitAppAutoUpdateQuery(before));
}

/** Additive and idempotent: never infer deployment identity from a mutable checkout. */
export async function migrateAppsAutoUpdate(now = new Date()): Promise<void> {
  await ManagedApp.updateMany(
    { 'autoUpdate.scheduleGeneration': null },
    { $set: { 'autoUpdate.scheduleGeneration': 0 } }
  );
  await ManagedApp.updateMany(
    { 'autoUpdate.consecutiveFailures': null },
    { $set: { 'autoUpdate.consecutiveFailures': 0 } }
  );
  await ManagedApp.updateMany(
    { sourceType: 'git', 'autoUpdate.enabled': true, 'autoUpdate.nextRunAt': null },
    { $set: { 'autoUpdate.nextRunAt': now } }
  );
  const legacy = await ManagedApp.find({
    sourceType: 'git',
    gitDeployedSha: null,
    currentReleaseId: { $exists: true },
  }).lean();
  for (const app of legacy) {
    const release = app.releases.find(
      (value) => value.id === app.currentReleaseId && value.status === 'active'
    );
    const proof = app.operations.find(
      (value) =>
        value.releaseId === app.currentReleaseId && value.status === 'succeeded' && value.commitSha
    );
    const sha = release?.commitSha ?? (release ? proof?.commitSha : undefined);
    if (sha)
      await ManagedApp.updateOne(
        { _id: app._id, currentReleaseId: app.currentReleaseId, gitDeployedSha: null },
        { $set: { gitDeployedSha: sha } }
      );
  }
  await Promise.all([AppOperation.createIndexes(), ManagedApp.createIndexes()]);
}

/** Replay terminal outcomes after a crash. App CAS is the idempotency boundary. */
export async function reconcileAutoUpdateResults(): Promise<void> {
  const operations = await AppOperation.find({
    type: 'update',
    active: false,
    autoUpdateProjectedAt: null,
  })
    .sort({ completedAt: 1, _id: 1 })
    .limit(100)
    .lean();
  for (const operation of operations) {
    const app = await ManagedApp.findById(operation.appId).lean();
    if (app && operation.status === 'cancelled' && operation.trigger === 'auto') {
      await ManagedApp.updateOne(
        {
          _id: app._id,
          'autoUpdate.enabled': true,
          'autoUpdate.scheduleGeneration': operation.scheduleGeneration,
          'autoUpdate.nextRunAt': operation.scheduledFor,
        },
        {
          $set: {
            'autoUpdate.nextRunAt': new Date(
              Math.max(Date.now(), (operation.scheduledFor?.getTime() ?? 0) + 1)
            ),
          },
          $unset: { 'autoUpdate.retryAt': 1 },
        }
      );
    }
    if (app && operation.status !== 'cancelled') {
      const generation = operation.scheduleGeneration ?? app.autoUpdate?.scheduleGeneration ?? 0;
      const completedAt = operation.completedAt ?? new Date();
      const failed = operation.status === 'failed';
      const failures = failed ? (app.autoUpdate?.consecutiveFailures ?? 0) + 1 : 0;
      const interval = app.autoUpdate?.intervalMinutes ?? 60;
      const configurationError =
        /authentication|could not read|remote branch|remote ref|origin does not match/i.test(
          operation.error?.message ?? ''
        );
      const next =
        failed && !configurationError
          ? nextRetryAt(completedAt, failures, interval)
          : new Date(completedAt.getTime() + interval * 60_000);
      const set: Record<string, unknown> = {
        'autoUpdate.lastProjectedOperationId': operation.operationId,
        'autoUpdate.lastOperationId': operation.operationId,
        'autoUpdate.lastRunAt': completedAt,
        'autoUpdate.lastStatus': failed
          ? 'failed'
          : operation.status === 'unchanged'
            ? 'unchanged'
            : 'updated',
        'autoUpdate.lastError': failed ? (operation.error?.message ?? 'Update failed') : '',
        'autoUpdate.consecutiveFailures': failures,
      };
      if (operation.startedAt) set['autoUpdate.lastAttemptAt'] = operation.startedAt;
      if (!failed) set['autoUpdate.lastCheckCompletedAt'] = completedAt;
      if (operation.status === 'succeeded') set['autoUpdate.lastSuccessfulDeployAt'] = completedAt;
      if (app.autoUpdate?.enabled) set['autoUpdate.nextRunAt'] = next;
      if (failed && app.autoUpdate?.enabled) set['autoUpdate.retryAt'] = next;
      const sha = operation.result?.commitSha;
      if (typeof sha === 'string') set['autoUpdate.observedRemoteSha'] = sha;
      await ManagedApp.updateOne(
        {
          _id: app._id,
          'autoUpdate.scheduleGeneration': generation,
          'autoUpdate.lastProjectedOperationId': { $ne: operation.operationId },
          $or: [
            { 'autoUpdate.lastOperationId': operation.operationId },
            { 'autoUpdate.lastOperationId': { $exists: false } },
            ...(operation.scheduledFor ? [{ 'autoUpdate.nextRunAt': operation.scheduledFor }] : []),
          ],
        },
        { $set: set, ...(!failed ? { $unset: { 'autoUpdate.retryAt': 1 } } : {}) }
      );
    }
    await AppOperation.updateOne(
      { operationId: operation.operationId },
      { $set: { autoUpdateProjectedAt: new Date() } }
    );
  }
}

let cursor: { due: Date; id: string } | undefined;
export async function runDueGitAppAutoUpdates(now = new Date()): Promise<GitAppAutoUpdateSummary> {
  await connectDB();
  await reconcileAutoUpdateResults();
  const due = dueGitAppAutoUpdateQuery(now);
  const after = cursor
    ? {
        $or: [
          { 'autoUpdate.nextRunAt': { $gt: cursor.due } },
          { 'autoUpdate.nextRunAt': cursor.due, _id: { $gt: cursor.id } },
        ],
      }
    : {};
  let apps = await ManagedApp.find({ $and: [due, after] })
    .sort({ 'autoUpdate.nextRunAt': 1, _id: 1 })
    .limit(100)
    .lean();
  if (apps.length === 0 && cursor) {
    cursor = undefined;
    apps = await ManagedApp.find(due).sort({ 'autoUpdate.nextRunAt': 1, _id: 1 }).limit(100).lean();
  }
  const summary = { checked: apps.length, queued: 0, busy: 0, blocked: 0, failedToQueue: 0 };
  for (const app of apps) {
    const scheduledFor = app.autoUpdate.nextRunAt ?? now;
    const generation = app.autoUpdate.scheduleGeneration ?? 0;
    cursor = { due: scheduledFor, id: app._id.toString() };
    try {
      const result = await enqueueAppOperation({
        appId: app._id.toString(),
        type: 'update',
        trigger: 'auto',
        scheduleGeneration: generation,
        scheduledFor,
        idempotencyKey: `auto:${app._id}:${generation}:${scheduledFor.toISOString()}`,
      });
      await ManagedApp.updateOne(
        {
          _id: app._id,
          'autoUpdate.enabled': true,
          'autoUpdate.scheduleGeneration': generation,
          'autoUpdate.nextRunAt': scheduledFor,
        },
        {
          $set: {
            'autoUpdate.lastOperationId': result.operation.id,
            'autoUpdate.lastScheduledFor': scheduledFor,
          },
        }
      );
      summary.queued += 1;
    } catch (error) {
      if (error instanceof ActiveAppOperationError) summary.busy += 1;
      else if (error instanceof AppsWorkerUnavailableError) summary.blocked += 1;
      else summary.failedToQueue += 1;
    }
  }
  return summary;
}
