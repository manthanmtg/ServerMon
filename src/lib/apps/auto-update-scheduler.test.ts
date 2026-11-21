/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { countDueGitAppAutoUpdates, logger, runDueGitAppAutoUpdates } = vi.hoisted(() => ({
  countDueGitAppAutoUpdates: vi.fn(),
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
  countDueGitAppAutoUpdates,
  runDueGitAppAutoUpdates,
}));

import {
  startGitAppAutoUpdateScheduler,
  stopGitAppAutoUpdateScheduler,
} from './auto-update-scheduler';

describe('git app auto-update scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-07T00:05:00.000Z'));
    vi.clearAllMocks();
    countDueGitAppAutoUpdates.mockResolvedValue(0);
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

  it('watchdog runs a recovery tick when enabled git apps are overdue', async () => {
    countDueGitAppAutoUpdates.mockResolvedValueOnce(2);

    startGitAppAutoUpdateScheduler({
      intervalMs: 60_000,
      watchdogGraceMs: 120_000,
      watchdogIntervalMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(0);
    runDueGitAppAutoUpdates.mockClear();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(countDueGitAppAutoUpdates).toHaveBeenCalledWith(new Date('2026-05-07T00:03:01.000Z'));
    expect(logger.warn).toHaveBeenCalledWith('Git app auto-update watchdog found overdue apps', {
      overdue: 2,
      overdueBefore: '2026-05-07T00:03:01.000Z',
    });
    expect(runDueGitAppAutoUpdates).toHaveBeenCalledTimes(1);
  });

  it('skips overlapping ticks so a slow update cannot start duplicate auto-update runs', async () => {
    let releaseTick: (() => void) | undefined;
    runDueGitAppAutoUpdates.mockReturnValueOnce(
      new Promise((resolve) => {
        releaseTick = () => resolve({ checked: 1, failed: 0, unchanged: 1, updated: 0 });
      })
    );

    startGitAppAutoUpdateScheduler({ intervalMs: 25 });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(25);

    expect(runDueGitAppAutoUpdates).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'Git app auto-update tick skipped while previous tick is running',
      {
        reason: 'scheduled',
        runningForMs: 25,
      }
    );

    releaseTick?.();
    await vi.advanceTimersByTimeAsync(0);
  });
});
