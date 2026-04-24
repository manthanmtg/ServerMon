import { writeFile, symlink, unlink, access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@/lib/logger';
import { ShellExecutor } from '../shell-executor';

const log = createLogger('self-service:nginx-vhost');

const SITES_AVAILABLE = '/etc/nginx/sites-available';
const SITES_ENABLED = '/etc/nginx/sites-enabled';

interface NginxVhostResult {
  success: boolean;
  logs: string[];
  error?: string;
}

export async function runNginxVhostSetup(
  domain: string,
  vhostContent: string,
  onLog: (line: string) => void
): Promise<NginxVhostResult> {
  const logs: string[] = [];
  const filename = domain.replace(/[^a-zA-Z0-9.-]/g, '_');
  const availablePath = join(SITES_AVAILABLE, filename);
  const enabledPath = join(SITES_ENABLED, filename);

  try {
    onLog(`Writing Nginx vhost config for ${domain}...`);
    logs.push(`Writing Nginx vhost config for ${domain}...`);

    await writeFile(availablePath, vhostContent, 'utf-8');
    onLog(`Written to ${availablePath}`);
    logs.push(`Written to ${availablePath}`);

    let alreadyEnabled = false;
    try {
      await access(enabledPath, constants.F_OK);
      alreadyEnabled = true;
    } catch {
      // not enabled yet
    }

    if (!alreadyEnabled) {
      await symlink(availablePath, enabledPath);
      onLog(`Symlinked to ${enabledPath}`);
      logs.push(`Symlinked to ${enabledPath}`);
    } else {
      onLog(`Already enabled at ${enabledPath}`);
      logs.push(`Already enabled at ${enabledPath}`);
    }

    const shell = new ShellExecutor();
    onLog('Testing Nginx configuration...');
    logs.push('Testing Nginx configuration...');

    const testResult = await shell.execute({ method: 'shell', commands: ['nginx -t'] }, (line) => {
      logs.push(line);
      onLog(line);
    });

    if (!testResult.success) {
      const msg = 'Nginx config test failed — rolling back vhost.';
      onLog(msg);
      logs.push(msg);
      log.error(msg);

      try {
        await unlink(enabledPath);
        await unlink(availablePath);
      } catch {
        // best effort cleanup
      }

      return { success: false, logs, error: msg };
    }

    const msg = `Nginx vhost for ${domain} configured successfully.`;
    onLog(msg);
    logs.push(msg);
    return { success: true, logs };
  } catch (err: unknown) {
    const error = err as { message?: string };
    const msg = error.message || 'Nginx vhost setup failed';
    log.error('Nginx vhost setup failed', err);
    onLog(`ERROR: ${msg}`);
    logs.push(`ERROR: ${msg}`);
    return { success: false, logs, error: msg };
  }
}

export async function rollbackNginxVhost(
  domain: string,
  onLog: (line: string) => void
): Promise<void> {
  const filename = domain.replace(/[^a-zA-Z0-9.-]/g, '_');
  const availablePath = join(SITES_AVAILABLE, filename);
  const enabledPath = join(SITES_ENABLED, filename);

  onLog(`Rolling back Nginx vhost for ${domain}...`);

  try {
    await unlink(enabledPath);
    onLog(`Removed symlink: ${enabledPath}`);
  } catch {
    // might not exist
  }

  try {
    await unlink(availablePath);
    onLog(`Removed config: ${availablePath}`);
  } catch {
    // might not exist
  }

  const shell = new ShellExecutor();
  await shell.execute({ method: 'shell', commands: ['nginx -t && nginx -s reload'] }, (line) =>
    onLog(line)
  );
}
