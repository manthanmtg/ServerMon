/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { cleanupIdleManagedDatabaseExplorersMock, loggerMock } = vi.hoisted(() => ({
  cleanupIdleManagedDatabaseExplorersMock: vi.fn(),
  loggerMock: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('./service', () => ({
  cleanupIdleManagedDatabaseExplorers: cleanupIdleManagedDatabaseExplorersMock,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => loggerMock,
}));

const importScheduler = async () => {
  vi.resetModules();
  return import('./explorer-scheduler');
};

describe('database explorer cleanup scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cleanupIdleManagedDatabaseExplorersMock.mockResolvedValue(0);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('runs cleanup immediately when started', async () => {
    const { startDatabaseExplorerCleanupScheduler } = await importScheduler();

    startDatabaseExplorerCleanupScheduler();
    await vi.advanceTimersByTimeAsync(0);

    expect(cleanupIdleManagedDatabaseExplorersMock).toHaveBeenCalledTimes(1);
  });

  it('runs cleanup again every five minutes', async () => {
    const { startDatabaseExplorerCleanupScheduler } = await importScheduler();

    startDatabaseExplorerCleanupScheduler();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(cleanupIdleManagedDatabaseExplorersMock).toHaveBeenCalledTimes(2);
  });

  it('does not start duplicate scheduler intervals', async () => {
    const { startDatabaseExplorerCleanupScheduler } = await importScheduler();

    startDatabaseExplorerCleanupScheduler();
    startDatabaseExplorerCleanupScheduler();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(cleanupIdleManagedDatabaseExplorersMock).toHaveBeenCalledTimes(2);
  });

  it('logs how many idle explorer sidecars were stopped', async () => {
    cleanupIdleManagedDatabaseExplorersMock.mockResolvedValue(3);
    const { startDatabaseExplorerCleanupScheduler } = await importScheduler();

    startDatabaseExplorerCleanupScheduler();
    await vi.advanceTimersByTimeAsync(0);

    expect(loggerMock.info).toHaveBeenCalledWith('Stopped 3 idle database explorer sidecar(s)');
  });

  it('logs cleanup failures without stopping future ticks', async () => {
    const failure = new Error('cleanup failed');
    cleanupIdleManagedDatabaseExplorersMock.mockRejectedValueOnce(failure).mockResolvedValue(0);
    const { startDatabaseExplorerCleanupScheduler } = await importScheduler();

    startDatabaseExplorerCleanupScheduler();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(loggerMock.error).toHaveBeenCalledWith(
      'Database explorer cleanup scheduler tick failed',
      failure
    );
    expect(cleanupIdleManagedDatabaseExplorersMock).toHaveBeenCalledTimes(2);
  });

  it('stops scheduled cleanup ticks', async () => {
    const { startDatabaseExplorerCleanupScheduler, stopDatabaseExplorerCleanupScheduler } =
      await importScheduler();

    startDatabaseExplorerCleanupScheduler();
    await vi.advanceTimersByTimeAsync(0);
    stopDatabaseExplorerCleanupScheduler();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(cleanupIdleManagedDatabaseExplorersMock).toHaveBeenCalledTimes(1);
  });
});
