import { createLogger } from '@/lib/logger';
import { detectCommand } from '../shell-executor';
import { ShellExecutor } from '../shell-executor';

const log = createLogger('self-service:firewall');

interface FirewallResult {
  success: boolean;
  logs: string[];
  skipped?: boolean;
  error?: string;
}

export async function runFirewallSetup(
  _servicePort: number | string,
  onLog: (line: string) => void,
): Promise<FirewallResult> {
  const logs: string[] = [];
  const shell = new ShellExecutor();

  onLog('Checking firewall (ufw)...');
  logs.push('Checking firewall (ufw)...');

  const ufwCheck = await detectCommand('which ufw');
  if (!ufwCheck.found) {
    const msg = 'UFW not found — skipping firewall configuration.';
    onLog(msg);
    logs.push(msg);
    return { success: true, logs, skipped: true };
  }

  const commands = [
    'ufw allow 80/tcp comment "HTTP"',
    'ufw allow 443/tcp comment "HTTPS"',
  ];

  for (const cmd of commands) {
    onLog(`$ ${cmd}`);
    logs.push(`$ ${cmd}`);

    const result = await shell.execute(
      { method: 'shell', commands: [cmd] },
      (line) => {
        logs.push(line);
        onLog(line);
      },
    );

    if (!result.success) {
      log.warn(`Firewall command failed: ${cmd}`, result.error);
    }
  }

  const msg = 'Firewall rules configured (HTTP/HTTPS allowed).';
  onLog(msg);
  logs.push(msg);
  return { success: true, logs };
}

export async function rollbackFirewall(
  onLog: (line: string) => void,
): Promise<void> {
  const logs: string[] = [];
  const ufwCheck = await detectCommand('which ufw');
  if (!ufwCheck.found) return;

  onLog('Rolling back firewall rules...');
  logs.push('Rolling back firewall rules...');
  log.info('Firewall rollback — HTTP/HTTPS rules are shared, not removing.');
  onLog('Firewall rules are shared (HTTP/HTTPS) — not removing.');
}
