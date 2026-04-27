import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '@/lib/logger';
import type { Executor, ExecutorResult, ExecutorPayload } from './executor';

const execFileAsync = promisify(execFile);
const log = createLogger('self-service:shell-executor');

export class ShellExecutor implements Executor {
  async execute(payload: ExecutorPayload, onLog: (line: string) => void): Promise<ExecutorResult> {
    const logs: string[] = [];
    const commands = payload.commands ?? [];

    if (commands.length === 0) {
      return { success: false, logs: [], error: 'No commands provided' };
    }

    for (const cmd of commands) {
      onLog(`$ ${cmd}`);
      logs.push(`$ ${cmd}`);

      try {
        const result = await this.runCommand(cmd, onLog);
        logs.push(...result.lines);
      } catch (err: unknown) {
        const error = err as { message?: string };
        const msg = error.message || 'Command failed';
        onLog(`ERROR: ${msg}`);
        logs.push(`ERROR: ${msg}`);
        log.error(`Shell command failed: ${cmd}`, err);
        return { success: false, logs, error: msg };
      }
    }

    return { success: true, logs };
  }

  private runCommand(cmd: string, onLog: (line: string) => void): Promise<{ lines: string[] }> {
    return new Promise((resolve, reject) => {
      const lines: string[] = [];
      const proc = spawn('bash', ['-c', cmd], {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 300_000,
      });

      const handleData = (data: Buffer) => {
        const text = data.toString();
        const newLines = text.split('\n').filter((l) => l.length > 0);
        for (const line of newLines) {
          lines.push(line);
          onLog(line);
        }
      };

      proc.stdout.on('data', handleData);
      proc.stderr.on('data', handleData);

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ lines });
        } else {
          reject(new Error(`Command exited with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }
}

export async function detectCommand(cmd: string): Promise<{ found: boolean; output: string }> {
  try {
    const { stdout } = await execFileAsync('bash', ['-c', cmd], {
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
    return { found: true, output: stdout.trim() };
  } catch {
    return { found: false, output: '' };
  }
}

export async function detectFile(path: string): Promise<boolean> {
  try {
    await execFileAsync('test', ['-e', path]);
    return true;
  } catch {
    return false;
  }
}

export async function detectPort(port: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      'bash',
      [
        '-c',
        `ss -tlnp 2>/dev/null | grep ':${port} ' || netstat -tlnp 2>/dev/null | grep ':${port} '`,
      ],
      {
        timeout: 5_000,
      }
    );
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export async function detectDockerContainer(name: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('docker', ['ps', '--format', '{{.Names}}'], {
      timeout: 10_000,
    });
    const containers = stdout.trim().split('\n');
    return containers.some((c) => c.trim() === name);
  } catch {
    return false;
  }
}

export async function detectSystemdService(service: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('systemctl', ['is-active', service], {
      timeout: 5_000,
    });
    return stdout.trim() === 'active';
  } catch {
    return false;
  }
}
