import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startNetworkSpeedtestScheduler, stopNetworkSpeedtestScheduler } from './speedtest-scheduler';
import { runDueScheduledNetworkSpeedtest } from './speedtest';
import { createLogger } from '@/lib/logger';

// Mock dependencies
vi.mock('@/lib/logger', () => {
  const mockLog = {
    info: vi.fn(),
    error: vi.fn(),
  };
  return {
    createLogger: vi.fn(() => mockLog),
  };
});

vi.mock('./speedtest', () => ({
  runDueScheduledNetworkSpeedtest: vi.fn(),
}));

describe('Network Speedtest Scheduler', () => {
  const mockLog = createLogger('network-speedtest-scheduler');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(runDueScheduledNetworkSpeedtest).mockResolvedValue({ ran: false });
  });

  afterEach(() => {
    stopNetworkSpeedtestScheduler();
    vi.useRealTimers();
  });

  it('should not throw when stopping an already stopped scheduler', () => {
    expect(() => stopNetworkSpeedtestScheduler()).not.toThrow();
  });

  it('should tick immediately on start', async () => {
    startNetworkSpeedtestScheduler();
    
    // Fast-forward the immediate setTimeout(..., 0)
    await vi.advanceTimersByTimeAsync(0);
    
    expect(runDueScheduledNetworkSpeedtest).toHaveBeenCalledTimes(1);
  });

  it('should tick according to default interval', async () => {
    startNetworkSpeedtestScheduler();
    
    // immediate tick
    await vi.advanceTimersByTimeAsync(0);
    expect(runDueScheduledNetworkSpeedtest).toHaveBeenCalledTimes(1);

    // wait default interval (60_000)
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runDueScheduledNetworkSpeedtest).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(runDueScheduledNetworkSpeedtest).toHaveBeenCalledTimes(3);
  });

  it('should use provided custom interval', async () => {
    const customInterval = 10_000;
    startNetworkSpeedtestScheduler({ intervalMs: customInterval });
    
    await vi.advanceTimersByTimeAsync(0); // immediate tick
    expect(runDueScheduledNetworkSpeedtest).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(customInterval);
    expect(runDueScheduledNetworkSpeedtest).toHaveBeenCalledTimes(2);
  });

  it('should not start multiple intervals if called multiple times', async () => {
    startNetworkSpeedtestScheduler();
    startNetworkSpeedtestScheduler();
    startNetworkSpeedtestScheduler();
    
    await vi.advanceTimersByTimeAsync(0);
    // Since schedulerInterval is set on the first call, subsequent calls return immediately.
    // So setTimeout(..., 0) is called exactly once.
    expect(runDueScheduledNetworkSpeedtest).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(runDueScheduledNetworkSpeedtest).toHaveBeenCalledTimes(2);
  });

  it('should log info when speedtest runs successfully', async () => {
    vi.mocked(runDueScheduledNetworkSpeedtest).mockResolvedValue({
      ran: true,
      result: { status: 'completed', downloadMbps: 100, uploadMbps: 50 } as unknown as import('@/modules/network/types').NetworkSpeedtestResult,
    });

    startNetworkSpeedtestScheduler();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockLog.info).toHaveBeenCalledWith('Scheduled speedtest completed', {
      status: 'completed',
      downloadMbps: 100,
      uploadMbps: 50,
    });
  });

  it('should log error when speedtest tick fails', async () => {
    const error = new Error('Tick failed test error');
    vi.mocked(runDueScheduledNetworkSpeedtest).mockRejectedValue(error);

    startNetworkSpeedtestScheduler();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockLog.error).toHaveBeenCalledWith('Scheduled speedtest tick failed', error);
  });

  it('should stop interval on stopNetworkSpeedtestScheduler', async () => {
    startNetworkSpeedtestScheduler();
    await vi.advanceTimersByTimeAsync(0);
    expect(runDueScheduledNetworkSpeedtest).toHaveBeenCalledTimes(1);

    stopNetworkSpeedtestScheduler();

    await vi.advanceTimersByTimeAsync(120_000);
    // Should not have run again after being stopped
    expect(runDueScheduledNetworkSpeedtest).toHaveBeenCalledTimes(1);
  });
});
