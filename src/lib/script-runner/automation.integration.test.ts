// @vitest-environment node
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import mongoose from 'mongoose';
import { expect, it, vi } from 'vitest';
import { POST as createGroup } from '@/app/api/modules/script-runner/env-groups/route';
import {
  DELETE as deleteGroup,
  PATCH as editGroup,
} from '@/app/api/modules/script-runner/env-groups/[id]/route';
import { DELETE as deleteVariable } from '@/app/api/modules/script-runner/env-vars/[id]/route';
import { POST as createScript } from '@/app/api/modules/script-runner/scripts/route';
import User from '@/models/User';
import {
  ScriptRunnerRun,
  ScriptRunnerScript,
  ScriptRunnerSettings,
  ScriptRunnerVariable,
  type RunRecord,
} from '@/models/ScriptRunner';
import { openEnvironment, sealVariable } from './environment';
import { enqueueRun } from './queue';
import { pruneRuns } from './retention';
import { enqueueDueSchedules } from './schedules';
import { outputPath, resultPath, runnerHost, storeScript } from './store';
import { runWorker } from './worker';
import { saveEnvGroup } from './variables';

const fixture = vi.hoisted(() => ({
  uri: process.env.SCRIPT_RUNNER_TEST_MONGO_URI,
  directory: '',
  dbName: '',
  adminId: '',
  exits: new Map<string, number | null>(),
}));

vi.mock('@/lib/db', () => ({
  default: () => mongoose.connect(fixture.uri!, { dbName: fixture.dbName }),
}));

vi.mock('@/lib/session', () => ({
  getSession: () => (fixture.adminId ? { user: { id: fixture.adminId, role: 'admin' } } : null),
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
      const modeId = randomUUID();
      const labelId = randomUUID();
      await ScriptRunnerVariable.create([
        {
          _id: modeId,
          host: runnerHost,
          key: 'REPORT_MODE',
          secret: false,
          valueSeal: sealVariable('default'),
        },
        {
          _id: labelId,
          host: runnerHost,
          key: 'REPORT_LABEL',
          secret: true,
          valueSeal: sealVariable('old'),
        },
      ]);
      const group = await saveEnvGroup({ name: 'Reports', variableIds: [modeId, labelId] });
      const saved = await storeScript({
        title: 'Recurring report',
        source: 'printf "%s %s\\n" "$REPORT_MODE" "$REPORT_LABEL"',
        language: 'bash',
        args: ['ready'],
        cwd: fixture.directory,
        env: [{ key: 'REPORT_MODE', value: 'daily' }],
        envVarIds: [modeId],
        envGroupIds: [group.id],
        timeoutSeconds: 10,
      });
      const scriptFilter = { _id: saved.id, host: runnerHost };
      const due = new Date(Date.now() - 18 * 60_000);
      await ScriptRunnerScript.updateOne(scriptFilter, {
        $set: {
          schedule: { enabled: true, intervalMinutes: 5, requestedBy: 'admin', nextRunAt: due },
        },
      });
      await ScriptRunnerSettings.updateOne(
        { _id: runnerHost },
        {
          $set: { maxHistoryRuns: 2, historyRetentionDays: 7, logRetentionDays: 1 },
        }
      );
      await ScriptRunnerVariable.updateOne(
        { _id: labelId },
        { $set: { valueSeal: sealVariable('ready') } }
      );
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

it.skipIf(!fixture.uri)(
  'keeps variable groups consistent across edits, deletion, and replay',
  async () => {
    fixture.dbName = `script_runner_test_${randomUUID()}`;
    vi.stubEnv('JWT_SECRET', 'script-runner-automation-fixture');
    const request = (method: string, body?: unknown) =>
      new Request('http://localhost/api/modules/script-runner', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    const byId = (id: string) => ({ params: Promise.resolve({ id }) });

    try {
      await mongoose.connect(fixture.uri!, { dbName: fixture.dbName });
      const user = await User.create({ username: 'admin', role: 'admin', passwordHash: 'fixture' });
      fixture.adminId = user.id;
      const tokenId = randomUUID();
      const modeId = randomUUID();
      await ScriptRunnerVariable.create([
        {
          _id: tokenId,
          host: runnerHost,
          key: 'BOT_TOKEN',
          secret: true,
          valueSeal: sealVariable('first'),
        },
        {
          _id: modeId,
          host: runnerHost,
          key: 'BOT_MODE',
          secret: false,
          valueSeal: sealVariable('weather'),
        },
      ]);
      const groupResponse = await createGroup(
        request('POST', { name: 'Weather bot', variableIds: [tokenId] })
      );
      expect(groupResponse.status).toBe(201);
      const group = await groupResponse.json();
      expect(group).toEqual({
        id: expect.any(String),
        name: 'Weather bot',
        variableIds: [tokenId],
      });
      const groupContext = byId(group.id);
      expect(
        (await createGroup(request('POST', { name: 'weather bot', variableIds: [modeId] }))).status
      ).toBe(409);
      expect((await deleteVariable(request('DELETE'), byId(tokenId))).status).toBe(409);

      const draft = {
        title: 'Weather updates',
        source: 'printf "%s\\n" "$BOT_TOKEN"',
        language: 'bash' as const,
        cwd: tmpdir(),
        args: [],
        timeoutSeconds: 10,
        envGroupIds: [group.id],
        env: Array.from({ length: 31 }, (_, index) => ({ key: `EXTRA_${index}`, value: '' })),
      };
      expect(
        (await createScript(request('POST', { ...draft, envGroupIds: [randomUUID()] }))).status
      ).toBe(422);
      const scriptResponse = await createScript(request('POST', draft));
      expect(scriptResponse.status).toBe(201);
      const { id: scriptId } = await scriptResponse.json();
      expect((await deleteGroup(request('DELETE'), groupContext)).status).toBe(409);

      const invalid = await editGroup(
        request('PATCH', { name: group.name, variableIds: [tokenId, modeId] }),
        groupContext
      );
      expect(invalid.status).toBe(422);
      expect(await invalid.json()).toMatchObject({ error: expect.stringContaining(draft.title) });
      const heartbeat = {
        workerId: 'test',
        workerSeenAt: new Date(),
        workerCapabilityId: 'test',
        workerLinkedEnvironmentId: 'test',
        workerProtocol: 2,
        workerRuntimes: ['bash'],
      };
      await ScriptRunnerSettings.updateOne({ _id: runnerHost }, { $set: heartbeat });
      const original = await enqueueRun({ scriptId }, 'admin');
      expect(openEnvironment(original.linkedEnvironmentSeal)).toEqual([
        { key: 'BOT_TOKEN', value: 'first' },
      ]);

      const changed = await editGroup(
        request('PATCH', { name: 'Weather Telegram bot', variableIds: [modeId] }),
        groupContext
      );
      expect(changed.status).toBe(200);
      const next = await enqueueRun({ scriptId }, 'admin');
      expect(openEnvironment(next.linkedEnvironmentSeal)).toEqual([
        { key: 'BOT_MODE', value: 'weather' },
      ]);
      const { envGroupIds: _groupIds, ...recordedDraft } = draft;
      const replay = await enqueueRun(
        { ...recordedDraft, scriptId, rerunOf: original._id },
        'admin'
      );
      expect(openEnvironment(replay.linkedEnvironmentSeal)).toEqual([
        { key: 'BOT_TOKEN', value: 'first' },
      ]);

      await ScriptRunnerScript.deleteOne({ _id: scriptId });
      expect((await deleteGroup(request('DELETE'), groupContext)).status).toBe(200);
      expect(await ScriptRunnerVariable.exists({ _id: modeId })).toBeTruthy();
    } finally {
      fixture.adminId = '';
      if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
      vi.unstubAllEnvs();
    }
  }
);
