/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { logger, runDueGitAppAutoUpdates } = vi.hoisted(() => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  runDueGitAppAutoUpdates: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => logger,
}));
vi.mock('./auto-update', () => ({
  runDueGitAppAutoUpdates,
}));

import {
  startGitAppAutoUpdateScheduler,
  stopGitAppAutoUpdateScheduler,
} from './auto-update-scheduler';

describe('git app auto-update scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    runDueGitAppAutoUpdates.mockResolvedValue({ checked: 0, failed: 0, unchanged: 0, updated: 0 });
  });

  afterEach(() => {
    stopGitAppAutoUpdateScheduler();
    vi.useRealTimers();
  });

  it('runs an immediate auto-update tick after starting', async () => {
    startGitAppAutoUpdateScheduler({ intervalMs: 60_000 });

    expect(runDueGitAppAutoUpdates).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(0);

    expect(runDueGitAppAutoUpdates).toHaveBeenCalledTimes(1);
  });

  it('continues running ticks at the configured interval', async () => {
    startGitAppAutoUpdateScheduler({ intervalMs: 25 });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(25);
    await vi.advanceTimersByTimeAsync(25);

    expect(runDueGitAppAutoUpdates).toHaveBeenCalledTimes(3);
  });

  it('does not start duplicate intervals when called twice', async () => {
    startGitAppAutoUpdateScheduler({ intervalMs: 50 });
    startGitAppAutoUpdateScheduler({ intervalMs: 50 });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);

    expect(runDueGitAppAutoUpdates).toHaveBeenCalledTimes(3);
  });

  it('stops future interval ticks after stopping', async () => {
    startGitAppAutoUpdateScheduler({ intervalMs: 10 });
    await vi.advanceTimersByTimeAsync(0);

    stopGitAppAutoUpdateScheduler();
    await vi.advanceTimersByTimeAsync(30);

    expect(runDueGitAppAutoUpdates).toHaveBeenCalledTimes(1);
  });

  it('logs completed ticks when apps were checked', async () => {
    runDueGitAppAutoUpdates.mockResolvedValueOnce({
      checked: 2,
      failed: 0,
      unchanged: 1,
      updated: 1,
    });

    startGitAppAutoUpdateScheduler();
    await vi.advanceTimersByTimeAsync(0);

    expect(logger.info).toHaveBeenCalledWith('Git app auto-update tick completed', {
      checked: 2,
      failed: 0,
      unchanged: 1,
      updated: 1,
    });
  });

  it('logs and swallows auto-update failures', async () => {
    const error = new Error('update failed');
    runDueGitAppAutoUpdates.mockRejectedValueOnce(error);

    startGitAppAutoUpdateScheduler();
    await vi.advanceTimersByTimeAsync(0);

    expect(logger.error).toHaveBeenCalledWith('Git app auto-update scheduler tick failed', error);
  });
});
