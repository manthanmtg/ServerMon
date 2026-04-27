import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '@/lib/logger';
import type { Executor, ExecutorResult, ExecutorPayload } from './executor';
import { ShellExecutor } from './shell-executor';

const execFileAsync = promisify(execFile);
const log = createLogger('self-service:package-executor');

type PackageManager = 'apt' | 'brew' | 'dnf' | 'yum' | 'pacman' | 'snap';

async function detectPackageManager(): Promise<PackageManager | null> {
  const managers: Array<{ name: PackageManager; cmd: string }> = [
    { name: 'apt', cmd: 'apt-get' },
    { name: 'dnf', cmd: 'dnf' },
    { name: 'yum', cmd: 'yum' },
    { name: 'pacman', cmd: 'pacman' },
    { name: 'brew', cmd: 'brew' },
    { name: 'snap', cmd: 'snap' },
  ];

  for (const { name, cmd } of managers) {
    try {
      await execFileAsync('which', [cmd], { timeout: 5_000 });
      return name;
    } catch {
      // not found, try next
    }
  }

  return null;
}

function buildInstallCommand(pm: PackageManager, packages: string[]): string {
  const pkgList = packages.join(' ');
  switch (pm) {
    case 'apt':
      return `DEBIAN_FRONTEND=noninteractive apt-get install -y ${pkgList}`;
    case 'dnf':
      return `dnf install -y ${pkgList}`;
    case 'yum':
      return `yum install -y ${pkgList}`;
    case 'pacman':
      return `pacman -S --noconfirm ${pkgList}`;
    case 'brew':
      return `brew install ${pkgList}`;
    case 'snap':
      return `snap install ${pkgList}`;
  }
}

export class PackageExecutor implements Executor {
  private shell = new ShellExecutor();

  async execute(payload: ExecutorPayload, onLog: (line: string) => void): Promise<ExecutorResult> {
    const logs: string[] = [];
    const packages = payload.packageNames ?? payload.commands ?? [];

    if (packages.length === 0) {
      return { success: false, logs: [], error: 'No packages specified' };
    }

    onLog('Detecting package manager...');
    logs.push('Detecting package manager...');

    const pm = await detectPackageManager();
    if (!pm) {
      const msg = 'No supported package manager found (apt, dnf, yum, pacman, brew, snap)';
      onLog(`ERROR: ${msg}`);
      logs.push(`ERROR: ${msg}`);
      log.error(msg);
      return { success: false, logs, error: msg };
    }

    onLog(`Found package manager: ${pm}`);
    logs.push(`Found package manager: ${pm}`);

    if (pm === 'apt') {
      onLog('Updating package index...');
      logs.push('Updating package index...');
      const updateResult = await this.shell.execute(
        { method: 'package-manager', commands: ['apt-get update -qq'] },
        (line) => {
          logs.push(line);
          onLog(line);
        }
      );
      if (!updateResult.success) {
        log.warn('apt-get update failed, continuing with install anyway');
      }
    }

    const installCmd = buildInstallCommand(pm, packages);
    onLog(`Installing: ${installCmd}`);
    logs.push(`Installing: ${installCmd}`);

    const result = await this.shell.execute(
      { method: 'package-manager', commands: [installCmd] },
      (line) => {
        logs.push(line);
        onLog(line);
      }
    );

    if (!result.success) {
      return { success: false, logs, error: result.error || 'Package installation failed' };
    }

    onLog('Package installation completed successfully.');
    logs.push('Package installation completed successfully.');
    return { success: true, logs };
  }
}
