// @vitest-environment node
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import mongoose from 'mongoose';
import { expect, it, vi } from 'vitest';
import {
  ScriptRunnerRun,
  ScriptRunnerScript,
  ScriptRunnerSettings,
  type RunRecord,
} from '@/models/ScriptRunner';
import { pruneRuns } from './retention';
import { enqueueDueSchedules } from './schedules';
import { outputPath, resultPath, runnerHost, storeScript } from './store';
import { runWorker } from './worker';

const fixture = vi.hoisted(() => ({
  uri: process.env.SCRIPT_RUNNER_TEST_MONGO_URI,
  directory: '',
  dbName: '',
  exits: new Map<string, number | null>(),
}));

vi.mock('@/lib/db', () => ({
  default: () => mongoose.connect(fixture.uri!, { dbName: fixture.dbName }),
}));

vi.mock('./store', async (original) => ({
  ...(await original<typeof import('./store')>()),
  supported: true,
  workerOnline: (seenAt?: Date) => !!seenAt && Date.now() - seenAt.getTime() < 20_000,
  outputPath: (id: string) => join(fixture.directory, `${id}.ndjson`),
  resultPath: (id: string) => join(fixture.directory, `${id}.result.json`),
}));

vi.mock('./systemd', async (original) => ({
  ...(await original<typeof import('./systemd')>()),
  probeRunner: async () => ({ protocol: 2, runtimes: ['bash'] }),
  startUnit: (id: string) => {
    const child = spawn('python3', ['-I', resolve('scripts/servermon-script-execute.py')], {
      env: { ...process.env, RUNTIME_DIRECTORY: fixture.directory },
    });
    child.once('exit', (code) => fixture.exits.set(id, code));
    return child;
  },
  inspectUnit: async (id: string) => ({
    state: fixture.exits.has(id) ? 'inactive' : 'missing',
    exitCode: fixture.exits.get(id) ?? null,
    signal: null,
  }),
  forgetUnit: async () => undefined,
}));

it.skipIf(!fixture.uri)(
  'queues an overdue script once, executes it, and prunes completed history and files',
  async () => {
    fixture.dbName = `script_runner_test_${randomUUID()}`;
    fixture.directory = await mkdtemp(join(tmpdir(), 'script-runner-automation-'));
    const controller = new AbortController();
    let worker: Promise<void> | undefined;
    vi.stubEnv('JWT_SECRET', 'script-runner-automation-fixture');
    try {
      await mongoose.connect(fixture.uri!, { dbName: fixture.dbName });
      const saved = await storeScript({
        title: 'Recurring report',
        source: 'printf "%s %s\\n" "$REPORT_MODE" "$1"',
        language: 'bash',
        args: ['ready'],
        cwd: fixture.directory,
        env: [{ key: 'REPORT_MODE', value: 'daily' }],
        timeoutSeconds: 10,
      });
      const scriptFilter = { _id: saved.id, host: runnerHost };
      const due = new Date(Date.now() - 18 * 60_000);
      await ScriptRunnerScript.updateOne(scriptFilter, {
        $set: {
          schedule: { enabled: true, intervalMinutes: 5, requestedBy: 'admin', nextRunAt: due },
        },
      });
      await ScriptRunnerSettings.create({
        _id: runnerHost,
        maxHistoryRuns: 2,
        historyRetentionDays: 7,
        logRetentionDays: 1,
      });
      worker = runWorker(controller.signal);
      const filter = { host: runnerHost, scriptId: saved.id };
      const run = await vi.waitFor(
        async () => {
          const record = await ScriptRunnerRun.findOne(filter).lean();
          expect(record?.status).toBe('succeeded');
          return record!;
        },
        { timeout: 6000 }
      );
      controller.abort();
      await worker;

      const schedule = (await ScriptRunnerScript.findOne(scriptFilter).lean())?.schedule;
      expect(schedule?.lastOutcome).toBe('queued');
      expect(schedule?.nextRunAt?.getTime()).toBe(due.getTime() + 20 * 60_000);
      expect(run).toMatchObject({ scheduledFor: due, requestedBy: 'admin', exitCode: 0 });
      expect(await ScriptRunnerRun.countDocuments(filter)).toBe(1);
      const { readOutput } = await import('./output');
      expect((await readOutput(outputPath(run._id), 0)).entries).toEqual([
        expect.objectContaining({ stream: 'stdout', text: 'daily ready\n' }),
      ]);

      // Simulate insertion having succeeded immediately before a worker restart.
      await ScriptRunnerScript.updateOne(scriptFilter, {
        $set: {
          'schedule.pendingRunId': run._id,
          'schedule.pendingScheduledFor': due,
          'schedule.lastOutcome': 'pending',
        },
      });
      await enqueueDueSchedules(new Date(), new AbortController().signal);
      expect((await ScriptRunnerScript.findOne(scriptFilter).lean())?.schedule).toMatchObject({
        lastOutcome: 'queued',
      });
      expect(await ScriptRunnerRun.countDocuments(filter)).toBe(1);

      async function seed(status: RunRecord['status'], daysAgo: number) {
        const id = randomUUID();
        const date = new Date(Date.now() - daysAgo * 86_400_000);
        await ScriptRunnerRun.create({
          ...filter,
          _id: id,
          title: saved.title,
          source: saved.source,
          cwd: saved.cwd,
          args: [],
          timeoutSeconds: 10,
          requestedBy: 'admin',
          status,
          createdAt: date,
          ...(status === 'succeeded' && { finishedAt: date }),
        });
        await Promise.all(
          [outputPath(id), resultPath(id), `${resultPath(id)}.tmp`].map((file) =>
            writeFile(file, 'fixture')
          )
        );
        return id;
      }
      const old = await seed('succeeded', 8);
      const overflow = await seed('succeeded', 3);
      const retained = await seed('succeeded', 2);
      const active = await seed('queued', 9);

      await ScriptRunnerScript.updateOne(scriptFilter, { $set: { 'schedule.nextRunAt': due } });
      await ScriptRunnerRun.updateOne({ _id: active }, { $set: { scheduledFor: due } });
      await enqueueDueSchedules(new Date(), new AbortController().signal);
      expect((await ScriptRunnerScript.findOne(scriptFilter).lean())?.schedule).toMatchObject({
        lastOutcome: 'skipped',
      });

      // Exercise the age rule independently of the count limit.
      await ScriptRunnerSettings.updateOne({ _id: runnerHost }, { $set: { maxHistoryRuns: 10 } });
      await pruneRuns(Date.now());
      expect(await ScriptRunnerRun.exists({ _id: old })).toBeNull();
      expect(await ScriptRunnerRun.exists({ _id: overflow })).toBeTruthy();
      await ScriptRunnerSettings.updateOne({ _id: runnerHost }, { $set: { maxHistoryRuns: 2 } });
      await pruneRuns(Date.now());
      expect(await ScriptRunnerRun.exists({ _id: overflow })).toBeNull();
      for (const id of [old, overflow, retained]) {
        for (const path of [outputPath(id), resultPath(id), `${resultPath(id)}.tmp`]) {
          await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' });
        }
      }
      expect((await ScriptRunnerRun.findById(retained).lean())?.logsPurgedAt).toBeInstanceOf(Date);
      expect(await ScriptRunnerRun.exists({ _id: active })).toBeTruthy();
      await expect(access(outputPath(active))).resolves.toBeUndefined();
      await expect(access(outputPath(run._id))).resolves.toBeUndefined();
    } finally {
      controller.abort();
      await worker?.catch(() => undefined);
      if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
      await rm(fixture.directory, { force: true, recursive: true });
      vi.unstubAllEnvs();
    }
  }
);
