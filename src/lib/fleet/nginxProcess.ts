import { spawn as realSpawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

export interface NginxProcessOpts {
  spawnImpl?: typeof realSpawn;
  binary?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

function runNginx(
  opts: NginxProcessOpts | undefined,
  args: string[]
): Promise<{ ok: boolean; stderr: string }> {
  const spawnImpl = opts?.spawnImpl ?? realSpawn;
  const binary = opts?.binary ?? 'nginx';
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    let stderr = '';
    const proc = spawnImpl(binary, args) as ChildProcess;

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve({
        ok: false,
        stderr: `${stderr}\n[ServerMon] Error: Command timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    proc.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stderr });
    });
  });
}

export function nginxTest(opts?: NginxProcessOpts): Promise<{ ok: boolean; stderr: string }> {
  return runNginx(opts, ['-t']);
}

export function nginxReload(opts?: NginxProcessOpts): Promise<{ ok: boolean; stderr: string }> {
  return runNginx(opts, ['-s', 'reload']);
}
