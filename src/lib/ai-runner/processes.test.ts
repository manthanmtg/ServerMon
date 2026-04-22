/** @vitest-environment node */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({
    unref: vi.fn(),
    pid: 1234,
  })),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

const runMock = vi.fn();

vi.mock('./supervisor', () => ({
  AIRunnerSupervisor: class AIRunnerSupervisor {
    run = runMock;
  },
}));

describe('ai-runner processes', () => {
  const originalEnv = { ...process.env };
  let processes: typeof import('./processes');

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    process.env = { ...originalEnv };
    vi.resetModules();
    processes = await import('./processes');
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...originalEnv };
  });

  it('spawnAIRunnerWorker calls spawn with correct arguments', () => {
    const pid = processes.spawnAIRunnerWorker('job-1', 'supervisor-1');
    
    expect(pid).toBe(1234);
    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      expect.arrayContaining([expect.stringContaining('worker-entry.ts'), 'job-1']),
      expect.objectContaining({
        detached: true,
        env: expect.objectContaining({
          AI_RUNNER_PROCESS_KIND: 'worker',
          AI_RUNNER_SUPERVISOR_INSTANCE_ID: 'supervisor-1',
          AI_RUNNER_JOB_ID: 'job-1',
        }),
      })
    );
  });

  it('ensureAIRunnerSupervisor spawns supervisor when not disabled and cooldown passed', async () => {
    // Force development environment to bypass the test check
    process.env = { ...process.env, NODE_ENV: 'development' };
    delete process.env.AI_RUNNER_DISABLE_SUPERVISOR;

    runMock.mockResolvedValue(undefined);

    processes.ensureAIRunnerSupervisor();
    await vi.dynamicImportSettled();

    expect(spawn).not.toHaveBeenCalled();
    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it('ensureAIRunnerSupervisor does not start multiple loops concurrently', async () => {
    process.env = { ...process.env, NODE_ENV: 'development' };
    delete process.env.AI_RUNNER_DISABLE_SUPERVISOR;

    runMock.mockReturnValue(new Promise(() => undefined));

    processes.ensureAIRunnerSupervisor();
    processes.ensureAIRunnerSupervisor();
    await vi.dynamicImportSettled();

    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it('ensureAIRunnerSupervisor does nothing if disabled', () => {
    process.env = { ...process.env, NODE_ENV: 'development' };
    process.env.AI_RUNNER_DISABLE_SUPERVISOR = '1';

    processes.ensureAIRunnerSupervisor();
    expect(spawn).not.toHaveBeenCalled();
    expect(runMock).not.toHaveBeenCalled();
  });

  it('ensureAIRunnerSupervisor does nothing in test environment (default)', () => {
    // process.env.NODE_ENV is 'test' by default in vitest
    processes.ensureAIRunnerSupervisor();
    expect(spawn).not.toHaveBeenCalled();
    expect(runMock).not.toHaveBeenCalled();
  });
});
