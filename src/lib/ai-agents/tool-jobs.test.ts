/** @vitest-environment node */
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

import { createAgentToolJobStore } from './tool-jobs';

type SpawnedProcess = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  pid: number;
};

function makeProcess(): SpawnedProcess {
  const child = new EventEmitter() as SpawnedProcess;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = 9876;
  return child;
}

describe('AI agent tool jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('runs a tool action in the background and records output', async () => {
    const child = makeProcess();
    vi.mocked(spawn).mockReturnValue(child as ReturnType<typeof spawn>);
    const store = createAgentToolJobStore();

    const job = store.start('gemini-cli', 'update');
    child.stdout.emit('data', Buffer.from('installing gemini\n'));
    child.stderr.emit('data', Buffer.from('warning: using global prefix\n'));
    child.emit('close', 0);

    const completed = store.get(job.id);
    expect(completed).toMatchObject({
      toolType: 'gemini-cli',
      action: 'update',
      status: 'succeeded',
      exitCode: 0,
    });
    expect(completed?.output).toContain('installing gemini');
    expect(completed?.output).toContain('warning: using global prefix');
    expect(spawn).toHaveBeenCalledWith('npm', ['install', '-g', '@google/gemini-cli'], {
      env: process.env,
      shell: false,
    });
  });

  it('rejects actions that are not configured for a tool', () => {
    const store = createAgentToolJobStore();

    expect(() => store.start('custom', 'update')).toThrow('No update action is configured');
  });

  it('marks jobs as failed when the command exits with a non-zero code', () => {
    const child = makeProcess();
    vi.mocked(spawn).mockReturnValue(child as ReturnType<typeof spawn>);
    const store = createAgentToolJobStore();

    const job = store.start('codex', 'install');
    child.stderr.emit('data', Buffer.from('install failed\n'));
    child.emit('close', 17);

    expect(store.get(job.id)).toMatchObject({
      status: 'failed',
      exitCode: 17,
      output: expect.stringContaining('install failed'),
    });
  });

  it('records spawn errors and appends the error message to output', () => {
    const child = makeProcess();
    vi.mocked(spawn).mockReturnValue(child as ReturnType<typeof spawn>);
    const store = createAgentToolJobStore();

    const job = store.start('aider', 'install');
    child.emit('error', new Error('pipx is unavailable'));

    expect(store.get(job.id)).toMatchObject({
      status: 'failed',
      error: 'pipx is unavailable',
      output: expect.stringContaining('pipx is unavailable'),
    });
  });

  it('lists newest jobs first and keeps only the most recent jobs', () => {
    vi.useFakeTimers();
    vi.mocked(spawn).mockImplementation(() => makeProcess() as ReturnType<typeof spawn>);
    const store = createAgentToolJobStore();

    for (let index = 0; index < 31; index += 1) {
      vi.setSystemTime(new Date(Date.UTC(2026, 0, 1, 0, 0, index)));
      store.start('gemini-cli', 'update');
    }

    const jobs = store.list();
    expect(jobs).toHaveLength(30);
    expect(jobs[0]?.startedAt).toBe('2026-01-01T00:00:30.000Z');
    expect(jobs.at(-1)?.startedAt).toBe('2026-01-01T00:00:01.000Z');
  });

  it('returns snapshots so callers cannot mutate stored jobs', () => {
    const child = makeProcess();
    vi.mocked(spawn).mockReturnValue(child as ReturnType<typeof spawn>);
    const store = createAgentToolJobStore();

    const started = store.start('gemini-cli', 'update');
    started.status = 'failed';
    started.output = 'mutated';

    const listed = store.list();
    const listedJob = listed[0];
    if (!listedJob) throw new Error('Expected a stored job');
    listedJob.output = 'changed from list';

    expect(store.get(started.id)).toMatchObject({
      status: 'running',
      output: '$ npm install -g @google/gemini-cli\n',
    });
  });
});
