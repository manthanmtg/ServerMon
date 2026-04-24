import { spawn as realSpawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

export type LogStream = 'stdout' | 'stderr';
export type LogHandler = (line: string, stream: LogStream) => void;

export interface StartOpts {
  binary: string;
  configPath: string;
  onLog?: LogHandler;
  spawnImpl?: typeof realSpawn;
  killTimeoutMs?: number;
}

export interface FrpHandle {
  pid: number | undefined;
  kill: () => Promise<void>;
  onExit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}

function attachLineReader(
  stream: NodeJS.ReadableStream | null,
  which: LogStream,
  onLog: LogHandler | undefined
): void {
  if (!stream || !onLog) return;
  let buf = '';
  stream.on('data', (chunk: Buffer | string) => {
    buf += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    let idx = buf.indexOf('\n');
    while (idx >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      onLog(line, which);
      idx = buf.indexOf('\n');
    }
  });
  stream.on('end', () => {
    if (buf.length > 0) {
      onLog(buf, which);
      buf = '';
    }
  });
}

function start(opts: StartOpts): FrpHandle {
  const { binary, configPath, onLog, spawnImpl = realSpawn, killTimeoutMs = 5000 } = opts;

  const proc = spawnImpl(binary, ['-c', configPath]) as ChildProcess;

  attachLineReader(proc.stdout, 'stdout', onLog);
  attachLineReader(proc.stderr, 'stderr', onLog);

  let exited = false;
  const onExit = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve) => {
    proc.on('exit', (code, signal) => {
      exited = true;
      resolve({ code, signal });
    });
  });

  const kill = async (): Promise<void> => {
    if (exited) return;
    proc.kill('SIGTERM');
    const timer = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), killTimeoutMs)
    );
    const winner = await Promise.race([onExit.then(() => 'exited' as const), timer]);
    if (winner === 'timeout' && !exited) {
      proc.kill('SIGKILL');
      await onExit;
    }
  };

  return {
    pid: proc.pid,
    kill,
    onExit,
  };
}

export function startFrps(opts: StartOpts): FrpHandle {
  return start(opts);
}

export function startFrpc(opts: StartOpts): FrpHandle {
  return start(opts);
}
