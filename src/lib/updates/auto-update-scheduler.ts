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
      const appResult = await runLocalAutoUpdateOnce('servermon');
      if (appResult.launched) {
        log.info(`ServerMon app auto-update launched for ${appResult.scheduledDate}`);
        return;
      }

      const agentResult = await runLocalAutoUpdateOnce('agent');
      if (agentResult.launched) {
        log.info(`ServerMon agent auto-update launched for ${agentResult.scheduledDate}`);
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
