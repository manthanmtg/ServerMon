import { createLogger } from '@/lib/logger';
import { detectCommand } from '../shell-executor';

const log = createLogger('self-service:health-check');

interface HealthCheckResult {
  success: boolean;
  logs: string[];
  error?: string;
}

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runHealthCheck(
  opts: { url?: string; command?: string },
  onLog: (line: string) => void
): Promise<HealthCheckResult> {
  const logs: string[] = [];

  if (!opts.url && !opts.command) {
    const msg = 'No health check configured — skipping.';
    onLog(msg);
    logs.push(msg);
    return { success: true, logs };
  }

  const checkTarget = opts.url || opts.command!;
  onLog(`Running health check: ${checkTarget}`);
  logs.push(`Running health check: ${checkTarget}`);
  onLog(`Will retry up to ${MAX_RETRIES} times with ${RETRY_DELAY_MS / 1000}s delay...`);
  logs.push(`Will retry up to ${MAX_RETRIES} times with ${RETRY_DELAY_MS / 1000}s delay...`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const cmd = opts.url ? `curl -sf -o /dev/null -w "%{http_code}" ${opts.url}` : opts.command!;

    const result = await detectCommand(cmd);

    if (result.found) {
      const msg = `Health check passed on attempt ${attempt}${opts.url ? ` (HTTP ${result.output})` : ''}.`;
      onLog(msg);
      logs.push(msg);
      return { success: true, logs };
    }

    const retryMsg = `Attempt ${attempt}/${MAX_RETRIES} failed. Retrying in ${RETRY_DELAY_MS / 1000}s...`;
    onLog(retryMsg);
    logs.push(retryMsg);

    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAY_MS);
    }
  }

  const msg = `Health check failed after ${MAX_RETRIES} attempts for: ${checkTarget}`;
  onLog(msg);
  logs.push(msg);
  log.error(msg);
  return { success: false, logs, error: msg };
}
