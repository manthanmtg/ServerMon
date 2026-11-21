import { createLogger } from '@/lib/logger';
import { countDueGitAppAutoUpdates, runDueGitAppAutoUpdates } from './auto-update';
import { recordSchedulerScan } from './repositories/worker-heartbeat-repository';

const log = createLogger('apps:auto-update-scheduler');
const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_WATCHDOG_GRACE_MS = 120_000;
const DEFAULT_WATCHDOG_INTERVAL_MS = 60_000;

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let watchdogInterval: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;
let tickStartedAt: number | null = null;

interface SchedulerOptions {
  workerId?: string;
  intervalMs?: number;
  watchdogGraceMs?: number;
  watchdogIntervalMs?: number;
}

export function startGitAppAutoUpdateScheduler(options: SchedulerOptions = {}): void {
  if (schedulerInterval) return;

  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const watchdogGraceMs = options.watchdogGraceMs ?? DEFAULT_WATCHDOG_GRACE_MS;
  const watchdogIntervalMs = options.watchdogIntervalMs ?? DEFAULT_WATCHDOG_INTERVAL_MS;
  const tick = async (reason: 'scheduled' | 'startup' | 'watchdog') => {
    if (tickInFlight) {
      log.warn('Git app auto-update tick skipped while previous tick is running', {
        reason,
        runningForMs: tickStartedAt === null ? 0 : Date.now() - tickStartedAt,
      });
      return;
    }

    tickInFlight = true;
    tickStartedAt = Date.now();
    try {
      if (options.workerId)
        await recordSchedulerScan(options.workerId, { lastScanStartedAt: new Date() });
      const result = await runDueGitAppAutoUpdates();
      if (options.workerId)
        await recordSchedulerScan(options.workerId, {
          lastScanCompletedAt: new Date(),
          ...(result.failedToQueue === 0 ? { lastSuccessfulScanAt: new Date() } : {}),
          lastScanError:
            result.failedToQueue > 0
              ? 'Unable to queue one or more due apps; check worker database connectivity and operation history'
              : '',
          scanCounts: { ...result },
        });
      if (result.checked > 0) {
        log.info('Git app auto-update tick completed', result);
      }
    } catch (error) {
      if (options.workerId) {
        await recordSchedulerScan(options.workerId, {
          lastScanCompletedAt: new Date(),
          lastScanError:
            'Scheduler scan failed; check worker database connectivity and service logs',
        }).catch(() => undefined);
      }
      log.error('Git app auto-update scheduler tick failed', error);
    } finally {
      tickInFlight = false;
      tickStartedAt = null;
    }
  };

  const watchdog = async () => {
    const overdueBefore = new Date(Date.now() - watchdogGraceMs);
    try {
      const overdue = await countDueGitAppAutoUpdates(overdueBefore);
      if (overdue === 0) return;

      log.warn('Git app auto-update watchdog found overdue apps', {
        overdue,
        overdueBefore: overdueBefore.toISOString(),
      });
      await tick('watchdog');
    } catch (error) {
      log.error('Git app auto-update watchdog failed', error);
    }
  };

  setTimeout(() => {
    void tick('startup');
  }, 0);
  schedulerInterval = setInterval(() => {
    void tick('scheduled');
  }, intervalMs);
  watchdogInterval = setInterval(() => {
    void watchdog();
  }, watchdogIntervalMs);
}

export function stopGitAppAutoUpdateScheduler(): void {
  if (schedulerInterval) clearInterval(schedulerInterval);
  if (watchdogInterval) clearInterval(watchdogInterval);
  schedulerInterval = null;
  watchdogInterval = null;
}
