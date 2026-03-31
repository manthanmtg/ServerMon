import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@/lib/logger';
import { ShellExecutor } from '../shell-executor';

const log = createLogger('self-service:systemd-unit');

const SYSTEMD_DIR = '/etc/systemd/system';

interface SystemdUnitResult {
  success: boolean;
  logs: string[];
  skipped?: boolean;
  error?: string;
}

export async function runSystemdUnitSetup(
  serviceName: string,
  unitContent: string | undefined,
  onLog: (line: string) => void,
): Promise<SystemdUnitResult> {
  const logs: string[] = [];

  if (!unitContent) {
    const msg = 'No systemd unit template provided — skipping.';
    onLog(msg);
    logs.push(msg);
    return { success: true, logs, skipped: true };
  }

  const unitName = serviceName.endsWith('.service') ? serviceName : `${serviceName}.service`;
  const unitPath = join(SYSTEMD_DIR, unitName);
  const shell = new ShellExecutor();

  try {
    onLog(`Writing systemd unit: ${unitPath}`);
    logs.push(`Writing systemd unit: ${unitPath}`);
    await writeFile(unitPath, unitContent, 'utf-8');

    const commands = [
      'systemctl daemon-reload',
      `systemctl enable ${unitName}`,
      `systemctl start ${unitName}`,
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
        const msg = `Systemd command failed: ${cmd}`;
        onLog(msg);
        logs.push(msg);
        log.error(msg, result.error);
        return { success: false, logs, error: result.error || msg };
      }
    }

    const msg = `Systemd service ${unitName} enabled and started.`;
    onLog(msg);
    logs.push(msg);
    return { success: true, logs };
  } catch (err: unknown) {
    const error = err as { message?: string };
    const msg = error.message || 'Systemd unit setup failed';
    log.error('Systemd unit setup failed', err);
    onLog(`ERROR: ${msg}`);
    logs.push(`ERROR: ${msg}`);
    return { success: false, logs, error: msg };
  }
}

export async function rollbackSystemdUnit(
  serviceName: string,
  onLog: (line: string) => void,
): Promise<void> {
  const unitName = serviceName.endsWith('.service') ? serviceName : `${serviceName}.service`;
  const unitPath = join(SYSTEMD_DIR, unitName);
  const shell = new ShellExecutor();

  onLog(`Rolling back systemd service: ${unitName}`);

  const commands = [
    `systemctl stop ${unitName} || true`,
    `systemctl disable ${unitName} || true`,
  ];

  for (const cmd of commands) {
    await shell.execute(
      { method: 'shell', commands: [cmd] },
      (line) => onLog(line),
    );
  }

  try {
    await unlink(unitPath);
    onLog(`Removed unit file: ${unitPath}`);
  } catch {
    // might not exist
  }

  await shell.execute(
    { method: 'shell', commands: ['systemctl daemon-reload'] },
    (line) => onLog(line),
  );
}
