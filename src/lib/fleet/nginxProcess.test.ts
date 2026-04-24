import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { nginxTest, nginxReload } from './nginxProcess';

interface FakeProc extends EventEmitter {
  pid: number;
  stdout: Readable;
  stderr: Readable;
  kill: ReturnType<typeof vi.fn>;
  _exit: (code: number | null, signal?: NodeJS.Signals | null) => void;
}

function makeFakeProc(): FakeProc {
  const proc = new EventEmitter() as FakeProc;
  proc.pid = 7;
  proc.stdout = new Readable({ read() {} });
  proc.stderr = new Readable({ read() {} });
  proc.kill = vi.fn();
  proc._exit = (code, signal = null) => {
    proc.emit('exit', code, signal);
  };
  return proc;
}

describe('nginxTest', () => {
  it('spawns `<binary> -t` and returns ok=true on exit 0', async () => {
    const fake = makeFakeProc();
    const spawnImpl = vi.fn(() => {
      setImmediate(() => {
        fake.stderr.push('nginx: configuration file ok\n');
        fake.stderr.push(null);
        fake._exit(0, null);
      });
      return fake as unknown as ReturnType<typeof import('node:child_process').spawn>;
    });
    const r = await nginxTest({
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
      binary: '/usr/sbin/nginx',
    });
    expect(spawnImpl).toHaveBeenCalledWith('/usr/sbin/nginx', ['-t']);
    expect(r.ok).toBe(true);
    expect(r.stderr).toContain('configuration file ok');
  });

  it('uses default binary "nginx" when not provided', async () => {
    const fake = makeFakeProc();
    const spawnImpl = vi.fn(() => {
      setImmediate(() => fake._exit(0, null));
      return fake as unknown as ReturnType<typeof import('node:child_process').spawn>;
    });
    await nginxTest({
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    expect(spawnImpl).toHaveBeenCalledWith('nginx', ['-t']);
  });

  it('returns ok=false and captured stderr when exit is non-zero', async () => {
    const fake = makeFakeProc();
    const spawnImpl = vi.fn(() => {
      setImmediate(() => {
        fake.stderr.push('nginx: [emerg] unknown directive\n');
        fake.stderr.push(null);
        fake._exit(1, null);
      });
      return fake as unknown as ReturnType<typeof import('node:child_process').spawn>;
    });
    const r = await nginxTest({
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    expect(r.ok).toBe(false);
    expect(r.stderr).toContain('unknown directive');
  });
});

describe('nginxReload', () => {
  it('spawns `<binary> -s reload` and returns ok=true on exit 0', async () => {
    const fake = makeFakeProc();
    const spawnImpl = vi.fn(() => {
      setImmediate(() => fake._exit(0, null));
      return fake as unknown as ReturnType<typeof import('node:child_process').spawn>;
    });
    const r = await nginxReload({
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
      binary: '/usr/sbin/nginx',
    });
    expect(spawnImpl).toHaveBeenCalledWith('/usr/sbin/nginx', ['-s', 'reload']);
    expect(r.ok).toBe(true);
  });

  it('returns ok=false and captured stderr on reload failure', async () => {
    const fake = makeFakeProc();
    const spawnImpl = vi.fn(() => {
      setImmediate(() => {
        fake.stderr.push('nginx: [error] invalid PID\n');
        fake.stderr.push(null);
        fake._exit(1, null);
      });
      return fake as unknown as ReturnType<typeof import('node:child_process').spawn>;
    });
    const r = await nginxReload({
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    expect(r.ok).toBe(false);
    expect(r.stderr).toContain('invalid PID');
  });
});
