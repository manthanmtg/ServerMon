/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.fn();
const spawnSyncMock = vi.fn();
const execFileMock = vi.fn();
const mkdirMock = vi.fn();
const writeFileMock = vi.fn();
const rmMock = vi.fn();

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
  spawn: spawnMock,
  spawnSync: spawnSyncMock,
}));

vi.mock('node:fs/promises', () => ({
  mkdir: mkdirMock,
  rm: rmMock,
  writeFile: writeFileMock,
}));

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => 'uuid-1'),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    warn: vi.fn(),
  }),
}));

describe('ai-runner execution', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
    rmMock.mockResolvedValue(undefined);
    execFileMock.mockImplementation((_file, _args, cb) => cb(null, '4321\n', ''));
    spawnMock.mockImplementation(() => ({
      pid: 1234,
      once: vi.fn(),
    }));
    spawnSyncMock.mockReturnValue({ status: 0 });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('spawns isolated systemd units on linux by default', async () => {
    const { spawnAIRunnerCommand } = await import('./execution');

    const result = await spawnAIRunnerCommand({
      jobId: 'job-1',
      shell: '/bin/bash',
      command: 'echo ok',
      cwd: '/tmp/example',
      env: { ...process.env, PATH: '/usr/bin', TOKEN: 'secret' },
    });

    expect(result.unitName).toContain('servermon-airunner-job-job-1-');
    expect(writeFileMock).toHaveBeenCalled();
    expect(execFileMock).toHaveBeenCalled();
    expect(spawnMock).toHaveBeenCalledWith(
      'systemd-run',
      expect.arrayContaining([
        '--collect',
        '--service-type=exec',
        '--slice',
        'servermon-ai-runner.slice',
        '--pipe',
      ]),
      expect.objectContaining({
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    );
  });

  it('falls back to detached local spawn when systemd isolation is disabled', async () => {
    process.env.AI_RUNNER_DISABLE_SYSTEMD_ISOLATION = '1';
    const { spawnAIRunnerCommand } = await import('./execution');

    const result = await spawnAIRunnerCommand({
      jobId: 'job-1',
      shell: '/bin/bash',
      command: 'echo ok',
      cwd: '/tmp/example',
      env: { ...process.env, PATH: '/usr/bin' },
    });

    expect(result.unitName).toBeUndefined();
    expect(result.pid).toBe(1234);
    expect(spawnMock).toHaveBeenCalledWith(
      '/bin/bash',
      ['-lc', 'echo ok'],
      expect.objectContaining({
        cwd: '/tmp/example',
        detached: true,
        env: expect.objectContaining({ PATH: '/usr/bin' }),
      })
    );
  });

  it('kills execution units before falling back to pid signals', async () => {
    const { terminateAIRunnerExecution } = await import('./execution');

    expect(terminateAIRunnerExecution({ unitName: 'servermon-airunner-job-1' })).toBe(true);
    expect(spawnSyncMock).toHaveBeenCalledWith(
      'systemctl',
      ['kill', 'servermon-airunner-job-1'],
      { stdio: 'ignore' }
    );
  });
});
