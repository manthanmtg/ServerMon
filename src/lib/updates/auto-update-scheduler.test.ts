/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRunLocalAutoUpdateOnce } = vi.hoisted(() => ({
  mockRunLocalAutoUpdateOnce: vi.fn(),
}));

vi.mock('@/lib/updates/auto-update', () => ({
  runLocalAutoUpdateOnce: mockRunLocalAutoUpdateOnce,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

describe('local auto-update scheduler', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockRunLocalAutoUpdateOnce.mockResolvedValue({ launched: false, reason: 'not-due' });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('runs one startup tick and then repeats on the configured interval', async () => {
    const { startLocalAutoUpdateScheduler } = await import('./auto-update-scheduler');

    startLocalAutoUpdateScheduler({ intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);

    expect(mockRunLocalAutoUpdateOnce).toHaveBeenCalledTimes(2);
    expect(mockRunLocalAutoUpdateOnce).toHaveBeenNthCalledWith(1, 'servermon');
    expect(mockRunLocalAutoUpdateOnce).toHaveBeenNthCalledWith(2, 'agent');

    await vi.advanceTimersByTimeAsync(1000);
    expect(mockRunLocalAutoUpdateOnce).toHaveBeenCalledTimes(4);
  });

  it('does not start duplicate intervals', async () => {
    const { startLocalAutoUpdateScheduler } = await import('./auto-update-scheduler');

    startLocalAutoUpdateScheduler({ intervalMs: 1000 });
    startLocalAutoUpdateScheduler({ intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);

    expect(mockRunLocalAutoUpdateOnce).toHaveBeenCalledTimes(4);
  });

  it('waits until the next tick to run the agent when the app update launches', async () => {
    mockRunLocalAutoUpdateOnce
      .mockResolvedValueOnce({ launched: true, reason: 'scheduled', scheduledDate: '2026-05-08' })
      .mockResolvedValue({ launched: false, reason: 'not-due' });
    const { startLocalAutoUpdateScheduler } = await import('./auto-update-scheduler');

    startLocalAutoUpdateScheduler({ intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);

    expect(mockRunLocalAutoUpdateOnce).toHaveBeenCalledTimes(1);
    expect(mockRunLocalAutoUpdateOnce).toHaveBeenCalledWith('servermon');

    await vi.advanceTimersByTimeAsync(1000);
    expect(mockRunLocalAutoUpdateOnce).toHaveBeenCalledWith('agent');
  });
});
