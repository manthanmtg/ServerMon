import { createLogger } from '@/lib/logger';
import { runLocalAutoUpdateOnce } from '@/lib/updates/auto-update';

const log = createLogger('auto-update-scheduler');
const DEFAULT_INTERVAL_MS = 60_000;

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

interface SchedulerOptions {
  intervalMs?: number;
}

export function startLocalAutoUpdateScheduler(options: SchedulerOptions = {}): void {
  if (schedulerInterval) return;

  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const tick = async () => {
    try {
      const result = await runLocalAutoUpdateOnce();
      if (result.launched) {
        log.info(`Local auto-update launched for ${result.scheduledDate}`);
      }
    } catch (error) {
      log.error('Local auto-update scheduler tick failed', error);
    }
  };

  setTimeout(() => {
    void tick();
  }, 0);
  schedulerInterval = setInterval(() => {
    void tick();
  }, intervalMs);
}

export function stopLocalAutoUpdateScheduler(): void {
  if (!schedulerInterval) return;
  clearInterval(schedulerInterval);
  schedulerInterval = null;
}
