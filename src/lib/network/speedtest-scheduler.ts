import { createLogger } from '@/lib/logger';
import { runDueScheduledNetworkSpeedtest } from '@/lib/network/speedtest';

const log = createLogger('network-speedtest-scheduler');
const DEFAULT_INTERVAL_MS = 60_000;

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

interface SchedulerOptions {
  intervalMs?: number;
}

export function startNetworkSpeedtestScheduler(options: SchedulerOptions = {}): void {
  if (schedulerInterval) return;

  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const tick = async () => {
    try {
      const result = await runDueScheduledNetworkSpeedtest();
      if (result.ran) {
        log.info('Scheduled speedtest completed', {
          status: result.result?.status,
          downloadMbps: result.result?.downloadMbps,
          uploadMbps: result.result?.uploadMbps,
        });
      }
    } catch (error) {
      log.error('Scheduled speedtest tick failed', error);
    }
  };

  setTimeout(() => {
    void tick();
  }, 0);

  schedulerInterval = setInterval(() => {
    void tick();
  }, intervalMs);
}

export function stopNetworkSpeedtestScheduler(): void {
  if (!schedulerInterval) return;
  clearInterval(schedulerInterval);
  schedulerInterval = null;
}
