/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

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
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');

  const setPlatform = (platform: NodeJS.Platform) => {
    Object.defineProperty(process, 'platform', {
      configurable: true,
      value: platform,
    });
  };

  const mockExecFileSuccess = () => {
    execFileMock.mockImplementation((file, args, optionsOrCallback, maybeCallback) => {
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;

      if (typeof callback !== 'function') {
        throw new Error('execFile callback not provided');
      }

      if (file === 'systemd-run' && Array.isArray(args) && args[0] === '--version') {
        callback(null, 'systemd 255\n', '');
        return;
      }

      if (file === 'systemctl') {
        callback(null, '4321\n', '');
        return;
      }

      callback(new Error(`Unexpected execFile call: ${file}`), '', '');
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...originalEnv };
    setPlatform('darwin');
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
    rmMock.mockResolvedValue(undefined);
    mockExecFileSuccess();
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & {
        pid: number;
        stdout: EventEmitter;
        stderr: EventEmitter;
      };
      child.pid = 1234;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      return child;
    });
    spawnSyncMock.mockReturnValue({ status: 0 });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  it('spawns isolated systemd units on linux by default', async () => {
    setPlatform('linux');
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
    expect(execFileMock).toHaveBeenCalledWith(
      'systemd-run',
      ['--version'],
      { timeout: 3000 },
      expect.any(Function)
    );
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

  it('spawns TTY workloads through script inside the isolated unit', async () => {
    setPlatform('linux');
    const { spawnAIRunnerCommand } = await import('./execution');

    await spawnAIRunnerCommand({
      jobId: 'job-tty',
      shell: '/bin/bash',
      command: 'printf tty-ok',
      cwd: '/tmp/example',
      env: { ...process.env, PATH: '/usr/bin' },
      requiresTTY: true,
    });

    expect(spawnMock).toHaveBeenCalledWith(
      'systemd-run',
      expect.arrayContaining(['/usr/bin/script', '-qefc']),
      expect.objectContaining({
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    );
  });

  it('resolves a systemd main pid on demand instead of blocking launch', async () => {
    const { resolveAIRunnerExecutionPid } = await import('./execution');

    await expect(
      resolveAIRunnerExecutionPid({ unitName: 'servermon-airunner-job-1' })
    ).resolves.toBe(4321);

    expect(execFileMock).toHaveBeenCalledWith(
      'systemctl',
      ['show', '--property=MainPID', '--value', 'servermon-airunner-job-1'],
      expect.any(Function)
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

  it('falls back to detached local spawn when systemd-run is unavailable', async () => {
    setPlatform('linux');
    execFileMock.mockImplementation((file, args, optionsOrCallback, maybeCallback) => {
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;

      if (typeof callback !== 'function') {
        throw new Error('execFile callback not provided');
      }

      if (file === 'systemd-run' && Array.isArray(args) && args[0] === '--version') {
        callback(new Error('systemd-run missing'), '', '');
        return;
      }

      callback(new Error(`Unexpected execFile call: ${file}`), '', '');
    });

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
    expect(spawnSyncMock).toHaveBeenCalledWith('systemctl', ['kill', 'servermon-airunner-job-1'], {
      stdio: 'ignore',
    });
  });
});
