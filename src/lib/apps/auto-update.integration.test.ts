/** @vitest-environment node */
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ default: async () => undefined }));
import ManagedApp from '@/models/ManagedApp';
import AppOperation from '@/models/AppOperation';
import AppOperationEvent from '@/models/AppOperationEvent';
import AppsWorkerHeartbeat from '@/models/AppsWorkerHeartbeat';
import {
  migrateAppsAutoUpdate,
  reconcileAutoUpdateResults,
  runDueGitAppAutoUpdates,
} from './auto-update';
import { enqueueAppOperation } from './application/enqueue-operation';
import { updateManagedApp } from './service';

const uri = process.env.APPS_TEST_MONGO_URI;
describe.skipIf(!uri)('automatic updates with real MongoDB', () => {
  const now = new Date();
  beforeAll(async () => {
    if (
      !uri ||
      !/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/servermon_apps_[a-z_]+_test$/.test(uri)
    )
      throw new Error(
        'Only an explicit localhost disposable servermon_apps_*_test database is permitted'
      );
    await mongoose.connect(uri);
    await migrateAppsAutoUpdate(now);
  });
  beforeEach(async () => {
    await Promise.all([
      ManagedApp.deleteMany({}),
      AppOperation.deleteMany({}),
      AppOperationEvent.deleteMany({}),
      AppsWorkerHeartbeat.deleteMany({}),
    ]);
    await AppsWorkerHeartbeat.create({
      workerId: 'test-worker',
      hostname: 'test',
      pid: 1,
      status: 'running',
      startedAt: now,
      lastSeenAt: new Date(),
    });
  });
  afterAll(async () => {
    await mongoose.disconnect();
  });
  async function app() {
    return ManagedApp.create({
      name: 'Example',
      slug: 'example',
      sourceType: 'git',
      gitUrl: 'https://example.com/repo.git',
      gitBranch: 'main',
      domain: 'example.test',
      port: 3010,
      commands: { install: 'true', build: 'true', start: 'true' },
      autoUpdate: { enabled: true, intervalMinutes: 1440, scheduleGeneration: 0, nextRunAt: now },
    });
  }
  it('racing schedulers and manual requests retain exactly one active operation', async () => {
    const record = await app();
    await Promise.allSettled([
      runDueGitAppAutoUpdates(now),
      runDueGitAppAutoUpdates(now),
      enqueueAppOperation({ appId: record.id, type: 'update' }),
    ]);
    expect(await AppOperation.countDocuments({ appId: record._id, active: true })).toBe(1);
  });
  it('reuses enqueue-before-schedule-write occurrence and projects failure exactly once', async () => {
    const record = await app();
    const accepted = await enqueueAppOperation({
      appId: record.id,
      type: 'update',
      trigger: 'auto',
      scheduledFor: now,
      scheduleGeneration: 0,
      idempotencyKey: `auto:${record.id}:0:${now.toISOString()}`,
    });
    await AppOperation.updateOne(
      { operationId: accepted.operation.id },
      {
        $set: {
          active: false,
          status: 'failed',
          completedAt: now,
          error: { code: 'BUILD', message: 'Build failed', retryable: true },
        },
      }
    );
    await Promise.all([reconcileAutoUpdateResults(), reconcileAutoUpdateResults()]);
    const saved = await ManagedApp.findById(record._id).lean();
    expect(saved?.autoUpdate.consecutiveFailures).toBe(1);
    expect(saved?.autoUpdate.nextRunAt).toEqual(new Date(now.getTime() + 60_000));
    await runDueGitAppAutoUpdates(now);
    expect(await AppOperation.countDocuments({ appId: record._id })).toBe(1);
  });
  it('preserves unrelated settings and history, changes interval, cancels queued disable', async () => {
    const record = await app();
    const completedAt = new Date(now.getTime() - 60 * 60_000);
    await ManagedApp.updateOne(
      { _id: record._id },
      { $set: { 'autoUpdate.lastCheckCompletedAt': completedAt } }
    );
    const input = {
      name: 'Renamed',
      sourceType: 'git' as const,
      gitUrl: record.gitUrl,
      gitBranch: record.gitBranch,
      domain: record.domain,
      port: record.port,
      commands: record.commands,
      autoUpdate: { enabled: true, intervalMinutes: 1440 },
    };
    await updateManagedApp(record.id, input);
    expect((await ManagedApp.findById(record._id))?.autoUpdate.nextRunAt).toEqual(now);
    await updateManagedApp(record.id, {
      ...input,
      autoUpdate: { enabled: true, intervalMinutes: 5 },
    });
    expect(
      (await ManagedApp.findById(record._id))?.autoUpdate.nextRunAt?.getTime()
    ).toBeGreaterThanOrEqual(now.getTime());
    await runDueGitAppAutoUpdates(new Date(Date.now() + 1000));
    await updateManagedApp(record.id, {
      ...input,
      autoUpdate: { enabled: false, intervalMinutes: 5 },
    });
    expect(await AppOperation.countDocuments({ appId: record._id, active: true })).toBe(0);
    const saved = await ManagedApp.findById(record._id);
    expect(saved?.autoUpdate.lastCheckCompletedAt).toEqual(completedAt);
  });
  it('migration normalizes legacy deadlines without trusting a failed checkout', async () => {
    const record = await app();
    await ManagedApp.collection.updateOne(
      { _id: record._id },
      {
        $unset: { 'autoUpdate.nextRunAt': '', 'autoUpdate.scheduleGeneration': '' },
        $set: { gitCurrentSha: 'failed-B', currentReleaseId: 'release-A' },
      }
    );
    await migrateAppsAutoUpdate(now);
    await migrateAppsAutoUpdate(now);
    const saved = await ManagedApp.findById(record._id);
    expect(saved?.autoUpdate.scheduleGeneration).toBe(0);
    expect(saved?.autoUpdate.nextRunAt).toEqual(now);
    expect(saved?.gitDeployedSha).toBeUndefined();
  });
});
