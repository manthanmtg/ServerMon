import { createLogger } from '@/lib/logger';
import { detectPort } from '../shell-executor';

const log = createLogger('self-service:port-check');

interface PortCheckResult {
  success: boolean;
  logs: string[];
  error?: string;
}

export async function runPortCheck(
  port: number | string,
  onLog: (line: string) => void,
): Promise<PortCheckResult> {
  const logs: string[] = [];
  const portStr = String(port);

  onLog(`Checking if port ${portStr} is available...`);
  logs.push(`Checking if port ${portStr} is available...`);

  const inUse = await detectPort(portStr);

  if (inUse) {
    const msg = `Port ${portStr} is already in use. Choose a different port or stop the conflicting service.`;
    onLog(msg);
    logs.push(msg);
    log.warn(msg);
    return { success: false, logs, error: msg };
  }

  const msg = `Port ${portStr} is available.`;
  onLog(msg);
  logs.push(msg);
  return { success: true, logs };
}
