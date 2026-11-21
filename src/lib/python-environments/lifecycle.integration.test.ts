// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import mongoose from 'mongoose';
import { expect, it, vi } from 'vitest';
import {
  PythonEnvironment,
  PythonEnvironmentWorker,
  PythonInterpreterInstallJob,
} from '@/models/PythonEnvironment';
import { ScriptRunnerRun, ScriptRunnerScript, ScriptRunnerSettings } from '@/models/ScriptRunner';
import { enqueueRun } from '@/lib/script-runner/queue';
import { enqueueDueSchedules } from '@/lib/script-runner/schedules';
import { storeScript } from '@/lib/script-runner/store';
import {
  buildEnvironment,
  createEnvironment,
  deleteEnvironment,
  environmentDetail,
  queueInterpreterInstall,
  restoreEnvironment,
} from './service';
import { PythonBuildError } from './host';
import { pythonEnvironmentHost as host } from './references';
import {
  processPythonBuild,
  processPythonInterpreterInstall,
  reconcilePythonEnvironmentStorage,
} from './worker';

const { build, remove, install } = vi.hoisted(() => ({
  build: vi.fn(),
  remove: vi.fn(),
  install: vi.fn(),
}));
vi.mock('./host', async (original) => ({
  ...(await original<typeof import('./host')>()),
  pythonBuildSupported: true,
  buildRevision: build,
  removeRevision: remove,
  installManagedPython: install,
}));

vi.mock('@/lib/script-runner/store', async (original) => ({
  ...(await original<typeof import('@/lib/script-runner/store')>()),
  workerOnline: () => true,
}));

const uri = process.env.SCRIPT_RUNNER_TEST_MONGO_URI;

it.skipIf(!uri)(
  'publishes good revisions, pins manual and scheduled runs, rolls back, and safely prunes',
  async () => {
    const dbName = `python_environments_test_${randomUUID()}`;
    const signal = new AbortController().signal;
    try {
      await mongoose.connect(uri!, { dbName });
      await PythonEnvironmentWorker.create({
        _id: host,
        workerId: 'fixture',
        seenAt: new Date(),
        interpreters: [{ id: 'python3.12', version: '3.12.3' }],
      });
      await ScriptRunnerSettings.create({
        _id: host,
        workerId: 'fixture',
        workerSeenAt: new Date(),
        workerCapabilityId: 'fixture',
        workerProtocol: 3,
        workerRuntimes: ['python'],
      });
      const version = '3.12.16';
      await queueInterpreterInstall(version);
      await queueInterpreterInstall(version);
      expect(await PythonInterpreterInstallJob.countDocuments()).toBe(1);
      install.mockRejectedValueOnce(new PythonBuildError('Install failed', 'Download unavailable'));
      expect(await processPythonInterpreterInstall(signal)).toBe(false);
      expect(await PythonInterpreterInstallJob.findOne().lean()).toMatchObject({
        status: 'failed',
        error: 'Download unavailable',
      });
      await queueInterpreterInstall(version);
      install.mockResolvedValue(undefined);
      expect(await processPythonInterpreterInstall(signal)).toBe(true);
      expect(install).toHaveBeenCalledWith(version, signal);
      expect(await PythonInterpreterInstallJob.findOne().lean()).toMatchObject({ status: 'ready' });
      const interpreterId = `uv-${version}`;
      await PythonEnvironmentWorker.updateOne(
        { _id: host },
        { $push: { interpreters: { id: interpreterId, version } } }
      );
      const { id } = await createEnvironment('Weather bot', interpreterId, 'httpx==0.28.1');
      const flags = {
        pythonVersion: version,
        packages: [{ name: 'httpx', version: '0.28.1' }],
        diskBytes: 1000,
        log: 'uv pip check succeeded',
      };
      build.mockResolvedValue(flags);
      remove.mockResolvedValue(undefined);

      async function runBuild() {
        const entry = await PythonEnvironment.findById(id).lean();
        const revision = entry?.revisions.at(-1);
        if (!entry || !revision) throw new Error('Build fixture was not queued');
        await processPythonBuild(entry, revision, signal);
        return revision.id;
      }

      const first = await runBuild();
      expect(build).toHaveBeenCalledWith(
        expect.objectContaining({ interpreterId }),
        expect.any(Function),
        signal
      );
      expect(await environmentDetail(id)).toMatchObject({
        active: { id: first, stage: 'ready', packageCount: 1 },
      });
      const draft = {
        title: 'Weather report',
        language: 'python' as const,
        source: 'print("ready")',
        cwd: tmpdir(),
        timeoutSeconds: 30,
        args: [],
        env: [],
        pythonEnvironmentId: id,
      };
      const script = await storeScript(draft);
      const initial = await enqueueRun({ scriptId: script.id }, 'admin');
      expect(initial).toMatchObject({
        status: 'queued_python',
        pythonEnvironment: { revisionId: first, environmentId: id },
      });

      await buildEnvironment(id, 'httpx==0.0.0');
      build.mockRejectedValueOnce(
        new PythonBuildError('The package version is unavailable.', 'fixture build log')
      );
      const broken = await runBuild();
      expect(await environmentDetail(id)).toMatchObject({
        active: { id: first, stage: 'ready' },
        latest: { id: broken, stage: 'failed' },
      });

      const due = new Date(Date.now() - 10_000);
      await ScriptRunnerScript.updateOne(
        { _id: script.id },
        {
          $set: {
            schedule: { intervalMinutes: 5, enabled: true, requestedBy: 'admin', nextRunAt: due },
          },
        }
      );
      await enqueueDueSchedules(new Date(), signal);
      expect(
        await ScriptRunnerRun.findOne({ scriptId: script.id, scheduledFor: due }).lean()
      ).toMatchObject({ status: 'queued_python', pythonEnvironment: { revisionId: first } });

      await buildEnvironment(id, 'httpx>=0.28');
      const second = await runBuild();
      await buildEnvironment(id, 'httpx>=0.28,<1');
      const third = await runBuild();
      expect(
        (await enqueueRun({ scriptId: script.id }, 'admin')).pythonEnvironment?.revisionId
      ).toBe(third);
      const replay = await enqueueRun(
        { ...draft, scriptId: script.id, rerunOf: initial._id },
        'admin'
      );
      expect(replay.pythonEnvironment?.revisionId).toBe(first);
      expect(
        (await enqueueRun({ ...draft, scriptId: script.id, pythonEnvironmentId: null }, 'admin'))
          .pythonEnvironment
      ).toBeUndefined();
      await reconcilePythonEnvironmentStorage(signal);
      expect(remove).not.toHaveBeenCalledWith(id, first);

      await ScriptRunnerRun.updateMany(
        { 'pythonEnvironment.revisionId': first },
        { $set: { status: 'succeeded' } }
      );
      await reconcilePythonEnvironmentStorage(signal);
      expect(remove).toHaveBeenCalledWith(id, first);
      await expect(
        enqueueRun({ ...draft, scriptId: script.id, rerunOf: initial._id }, 'admin')
      ).rejects.toThrow('recorded Python environment revision');
      await restoreEnvironment(id, second);
      expect((await environmentDetail(id)).active?.id).toBe(second);

      await expect(deleteEnvironment(id)).rejects.toThrow('Unlink this environment');
      await ScriptRunnerScript.updateOne(
        { _id: script.id },
        { $unset: { pythonEnvironmentId: 1 } }
      );
      await expect(deleteEnvironment(id)).rejects.toThrow('active runs');
      await ScriptRunnerRun.updateMany(
        { 'pythonEnvironment.environmentId': id },
        { $set: { status: 'succeeded' } }
      );
      await deleteEnvironment(id);
      await reconcilePythonEnvironmentStorage(signal);
      expect(await PythonEnvironment.exists({ _id: id })).toBeNull();
    } finally {
      if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
);
