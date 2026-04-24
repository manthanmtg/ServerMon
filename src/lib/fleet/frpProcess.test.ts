import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { startFrps, startFrpc, type LogStream } from './frpProcess';

interface FakeProc extends EventEmitter {
  pid: number;
  stdout: Readable;
  stderr: Readable;
  kill: ReturnType<typeof vi.fn>;
  _signals: string[];
  _exit: (code: number | null, signal?: NodeJS.Signals | null) => void;
}

function makeFakeProc(): FakeProc {
  const proc = new EventEmitter() as FakeProc;
  proc.pid = 42;
  proc.stdout = new Readable({ read() {} });
  proc.stderr = new Readable({ read() {} });
  proc._signals = [];
  proc.kill = vi.fn((sig?: string) => {
    proc._signals.push(sig ?? 'SIGTERM');
    return true;
  });
  proc._exit = (code, signal = null) => {
    proc.emit('exit', code, signal);
  };
  return proc;
}

describe('startFrps', () => {
  it('spawns binary with -c configPath args', () => {
    const fake = makeFakeProc();
    const spawnImpl = vi.fn(() => fake);
    startFrps({
      binary: '/bin/frps',
      configPath: '/etc/frps.toml',
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    expect(spawnImpl).toHaveBeenCalledWith('/bin/frps', ['-c', '/etc/frps.toml']);
  });

  it('returns pid from spawned process', () => {
    const fake = makeFakeProc();
    fake.pid = 1234;
    const spawnImpl = vi.fn(() => fake);
    const h = startFrps({
      binary: '/bin/frps',
      configPath: '/etc/frps.toml',
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    expect(h.pid).toBe(1234);
  });

  it('fires onLog for newline-terminated chunks on stdout', async () => {
    const fake = makeFakeProc();
    const spawnImpl = vi.fn(() => fake);
    const lines: Array<{ line: string; stream: LogStream }> = [];
    startFrps({
      binary: '/bin/frps',
      configPath: '/etc/frps.toml',
      onLog: (line, stream) => lines.push({ line, stream }),
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    fake.stdout.push('hello\nworld\n');
    fake.stdout.push('part');
    fake.stdout.push('ial\n');
    // flush
    await new Promise((r) => setImmediate(r));
    expect(lines).toEqual([
      { line: 'hello', stream: 'stdout' },
      { line: 'world', stream: 'stdout' },
      { line: 'partial', stream: 'stdout' },
    ]);
  });

  it('fires onLog for newline-terminated chunks on stderr', async () => {
    const fake = makeFakeProc();
    const spawnImpl = vi.fn(() => fake);
    const lines: Array<{ line: string; stream: LogStream }> = [];
    startFrps({
      binary: '/bin/frps',
      configPath: '/etc/frps.toml',
      onLog: (line, stream) => lines.push({ line, stream }),
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    fake.stderr.push('err1\nerr2\n');
    await new Promise((r) => setImmediate(r));
    expect(lines).toEqual([
      { line: 'err1', stream: 'stderr' },
      { line: 'err2', stream: 'stderr' },
    ]);
  });

  it('flushes trailing partial line on stream end', async () => {
    const fake = makeFakeProc();
    const spawnImpl = vi.fn(() => fake);
    const lines: Array<{ line: string; stream: LogStream }> = [];
    startFrps({
      binary: '/bin/frps',
      configPath: '/etc/frps.toml',
      onLog: (line, stream) => lines.push({ line, stream }),
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    fake.stdout.push('no-newline');
    fake.stdout.push(null);
    await new Promise((r) => setImmediate(r));
    expect(lines).toEqual([{ line: 'no-newline', stream: 'stdout' }]);
  });

  it('onExit resolves with code and signal', async () => {
    const fake = makeFakeProc();
    const spawnImpl = vi.fn(() => fake);
    const h = startFrps({
      binary: '/bin/frps',
      configPath: '/etc/frps.toml',
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    setImmediate(() => fake._exit(0, null));
    const r = await h.onExit;
    expect(r).toEqual({ code: 0, signal: null });
  });

  it('kill sends SIGTERM immediately and resolves when process exits', async () => {
    const fake = makeFakeProc();
    const spawnImpl = vi.fn(() => fake);
    const h = startFrps({
      binary: '/bin/frps',
      configPath: '/etc/frps.toml',
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
      killTimeoutMs: 100,
    });
    const killP = h.kill();
    // allow SIGTERM to be sent
    await new Promise((r) => setImmediate(r));
    expect(fake._signals).toEqual(['SIGTERM']);
    // simulate graceful exit before timeout
    fake._exit(0, 'SIGTERM');
    await killP;
    // no SIGKILL should have been sent
    expect(fake._signals).toEqual(['SIGTERM']);
  });

  it('kill escalates to SIGKILL after timeout if not exited', async () => {
    const fake = makeFakeProc();
    const spawnImpl = vi.fn(() => fake);
    const h = startFrps({
      binary: '/bin/frps',
      configPath: '/etc/frps.toml',
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
      killTimeoutMs: 20,
    });
    const killP = h.kill();
    // Don't exit immediately; wait past timeout
    await new Promise((r) => setTimeout(r, 40));
    expect(fake._signals).toEqual(['SIGTERM', 'SIGKILL']);
    // Now let it exit so kill() resolves
    fake._exit(null, 'SIGKILL');
    await killP;
  });
});

describe('startFrpc', () => {
  it('spawns configured binary with -c configPath', () => {
    const fake = makeFakeProc();
    const spawnImpl = vi.fn(() => fake);
    startFrpc({
      binary: '/bin/frpc',
      configPath: '/etc/frpc.toml',
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    expect(spawnImpl).toHaveBeenCalledWith('/bin/frpc', ['-c', '/etc/frpc.toml']);
  });
});
