import { createLogger } from '@/lib/logger';
import { cleanupIdleManagedDatabaseExplorers } from './service';

const log = createLogger('databases:explorer-scheduler');
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

export function startDatabaseExplorerCleanupScheduler() {
  if (schedulerInterval) return;

  const runCleanup = async () => {
    try {
      const stopped = await cleanupIdleManagedDatabaseExplorers();
      if (stopped > 0) {
        log.info(`Stopped ${stopped} idle database explorer sidecar(s)`);
      }
    } catch (error: unknown) {
      log.error('Database explorer cleanup scheduler tick failed', error);
    }
  };

  void runCleanup();
  schedulerInterval = setInterval(() => {
    void runCleanup();
  }, CHECK_INTERVAL_MS);
}

export function stopDatabaseExplorerCleanupScheduler() {
  if (!schedulerInterval) return;
  clearInterval(schedulerInterval);
  schedulerInterval = null;
}
