import { spawn as realSpawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

export interface NginxProcessOpts {
  spawnImpl?: typeof realSpawn;
  binary?: string;
}

function runNginx(
  opts: NginxProcessOpts | undefined,
  args: string[]
): Promise<{ ok: boolean; stderr: string }> {
  const spawnImpl = opts?.spawnImpl ?? realSpawn;
  const binary = opts?.binary ?? 'nginx';
  return new Promise((resolve, reject) => {
    let stderr = '';
    const proc = spawnImpl(binary, args) as ChildProcess;
    proc.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    });
    proc.on('error', (err) => reject(err));
    proc.on('exit', (code) => {
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
