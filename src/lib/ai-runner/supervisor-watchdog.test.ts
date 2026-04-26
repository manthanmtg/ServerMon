/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AIRunnerSupervisorLease from '@/models/AIRunnerSupervisorLease';
import { ensureAIRunnerSupervisor } from './processes';

vi.mock('@/lib/db', () => ({
  default: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/models/AIRunnerSupervisorLease', () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock('./processes', () => ({
  ensureAIRunnerSupervisor: vi.fn(),
}));

vi.mock('./logs', () => ({
  writeAIRunnerLogEntry: vi.fn().mockResolvedValue(undefined),
}));

describe('ai-runner supervisor watchdog', () => {
  const originalEnv = { ...process.env };
  const timersToClear: Array<ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>> = [];

  const originalSetInterval = globalThis.setInterval;
  const originalSetTimeout = globalThis.setTimeout;
  let watchdog: typeof import('./supervisor-watchdog');

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.resetModules();
    watchdog = await import('./supervisor-watchdog');
    process.env = { ...originalEnv, NODE_ENV: 'development' };
    timersToClear.length = 0;
  });

  afterEach(() => {
    for (const timer of timersToClear) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    globalThis.setInterval = originalSetInterval;
    globalThis.setTimeout = originalSetTimeout;
    vi.useRealTimers();
    process.env = originalEnv;
    vi.resetModules();
  });

  it('spawns the supervisor immediately when no fresh lease exists', async () => {
    vi.mocked(AIRunnerSupervisorLease.findById).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as unknown as ReturnType<typeof AIRunnerSupervisorLease.findById>);

    await watchdog.checkAIRunnerSupervisorWatchdog();

    expect(ensureAIRunnerSupervisor).toHaveBeenCalledTimes(1);
  });

  it('does not spawn another supervisor while the lease is fresh', async () => {
    vi.setSystemTime(new Date('2026-04-26T12:00:00.000Z'));
    vi.mocked(AIRunnerSupervisorLease.findById).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        expiresAt: new Date('2026-04-26T12:00:30.000Z'),
      }),
    } as unknown as ReturnType<typeof AIRunnerSupervisorLease.findById>);

    await watchdog.checkAIRunnerSupervisorWatchdog();

    expect(ensureAIRunnerSupervisor).not.toHaveBeenCalled();
  });

  it('keeps rechecking the supervisor lease while ServerMon stays alive', async () => {
    let firstCheck = true;
    vi.mocked(AIRunnerSupervisorLease.findById).mockImplementation(
      () =>
        ({
          lean: vi.fn().mockResolvedValue(
            firstCheck
              ? {
                  expiresAt: new Date('2026-04-26T12:00:30.000Z'),
                }
              : null
          ),
        }) as unknown as ReturnType<typeof AIRunnerSupervisorLease.findById>
    );

    vi.setSystemTime(new Date('2026-04-26T12:00:00.000Z'));
    watchdog.startAIRunnerSupervisorWatchdog(1_000);

    await vi.advanceTimersByTimeAsync(0);
    expect(ensureAIRunnerSupervisor).not.toHaveBeenCalled();

    firstCheck = false;
    await vi.advanceTimersByTimeAsync(1_000);

    expect(ensureAIRunnerSupervisor).toHaveBeenCalledTimes(1);
  });

  it('starts only one watchdog loop per server process', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    vi.mocked(AIRunnerSupervisorLease.findById).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as unknown as ReturnType<typeof AIRunnerSupervisorLease.findById>);

    watchdog.startAIRunnerSupervisorWatchdog(1_000);
    watchdog.startAIRunnerSupervisorWatchdog(1_000);

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
  });
});
