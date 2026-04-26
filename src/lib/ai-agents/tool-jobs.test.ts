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
});
