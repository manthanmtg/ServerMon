import { createLogger } from '@/lib/logger';
import { runDueGitAppAutoUpdates } from './auto-update';

const log = createLogger('apps:auto-update-scheduler');
const DEFAULT_INTERVAL_MS = 60_000;

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

interface SchedulerOptions {
  intervalMs?: number;
}

export function startGitAppAutoUpdateScheduler(options: SchedulerOptions = {}): void {
  if (schedulerInterval) return;

  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const tick = async () => {
    try {
      const result = await runDueGitAppAutoUpdates();
      if (result.checked > 0) {
        log.info('Git app auto-update tick completed', result);
      }
    } catch (error) {
      log.error('Git app auto-update scheduler tick failed', error);
    }
  };

  setTimeout(() => {
    void tick();
  }, 0);
  schedulerInterval = setInterval(() => {
    void tick();
  }, intervalMs);
}

export function stopGitAppAutoUpdateScheduler(): void {
  if (!schedulerInterval) return;
  clearInterval(schedulerInterval);
  schedulerInterval = null;
}
