import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { createDefaultExecutors } from './preflightExecutors';

interface FakeProc extends EventEmitter {
  pid?: number;
  stdout: Readable;
  stderr: Readable;
  kill: ReturnType<typeof vi.fn>;
  _exit: (code: number | null) => void;
  _error: (err: Error) => void;
}

function makeFakeProc(): FakeProc {
  const proc = new EventEmitter() as FakeProc;
  proc.pid = 1;
  proc.stdout = new Readable({ read() {} });
  proc.stderr = new Readable({ read() {} });
  proc.kill = vi.fn();
  proc._exit = (code) => proc.emit('exit', code, null);
  proc._error = (err) => proc.emit('error', err);
  return proc;
}

/** Fake `net.Server` for checkPortAvailable tests */
interface FakeServer extends EventEmitter {
  listen: (port: number, host?: string) => void;
  close: (cb?: () => void) => void;
}

function makeFakeServer(opts: { simulate: 'listen' | 'error'; errCode?: string }): FakeServer {
  const s = new EventEmitter() as FakeServer;
  s.listen = () => {
    setImmediate(() => {
      if (opts.simulate === 'listen') s.emit('listening');
      else {
        const err = new Error(opts.errCode || 'err') as NodeJS.ErrnoException;
        err.code = opts.errCode;
        s.emit('error', err);
      }
    });
  };
  s.close = (cb) => {
    setImmediate(() => cb?.());
  };
  return s;
}

/** Fake `net.Socket` for checkPortReachable */
interface FakeSocket extends EventEmitter {
  destroy: ReturnType<typeof vi.fn>;
}

function makeFakeSocket(opts: { simulate: 'connect' | 'error' | 'hang' }): FakeSocket {
  const sock = new EventEmitter() as FakeSocket;
  sock.destroy = vi.fn();
  setImmediate(() => {
    if (opts.simulate === 'connect') sock.emit('connect');
    else if (opts.simulate === 'error') sock.emit('error', new Error('ECONNREFUSED'));
    // 'hang' => never emit
  });
  return sock;
}

describe('createDefaultExecutors', () => {
  it('returns an object with every expected probe', () => {
    const ex = createDefaultExecutors();
    expect(typeof ex.checkPortAvailable).toBe('function');
    expect(typeof ex.checkPortReachable).toBe('function');
    expect(typeof ex.checkNginxBinary).toBe('function');
    expect(typeof ex.checkNginxManagedDir).toBe('function');
    expect(typeof ex.checkMongoConnection).toBe('function');
    expect(typeof ex.checkDiskFree).toBe('function');
    expect(typeof ex.checkDns).toBe('function');
    expect(typeof ex.checkTlsCertificate).toBe('function');
    expect(typeof ex.detectServiceManager).toBe('function');
    expect(typeof ex.checkFrpBinary).toBe('function');
  });
});

describe('checkPortAvailable', () => {
  it('returns available when listen succeeds', async () => {
    const server = makeFakeServer({ simulate: 'listen' });
    const netImpl = {
      createServer: vi.fn(() => server),
    } as unknown as typeof import('node:net');
    const ex = createDefaultExecutors({ netImpl });
    const r = await ex.checkPortAvailable!(7000);
    expect(r.available).toBe(true);
  });

  it('returns not available when EADDRINUSE', async () => {
    const server = makeFakeServer({ simulate: 'error', errCode: 'EADDRINUSE' });
    const netImpl = {
      createServer: vi.fn(() => server),
    } as unknown as typeof import('node:net');
    const ex = createDefaultExecutors({ netImpl });
    const r = await ex.checkPortAvailable!(7000);
    expect(r.available).toBe(false);
    expect(r.detail).toMatch(/in use/i);
  });

  it('reports detail on other errors', async () => {
    const server = makeFakeServer({ simulate: 'error', errCode: 'EACCES' });
    const netImpl = {
      createServer: vi.fn(() => server),
    } as unknown as typeof import('node:net');
    const ex = createDefaultExecutors({ netImpl });
    const r = await ex.checkPortAvailable!(80);
    expect(r.available).toBe(false);
    expect(r.detail).toBeTruthy();
  });
});

describe('checkPortReachable', () => {
  it('returns reachable on connect', async () => {
    const sock = makeFakeSocket({ simulate: 'connect' });
    const netImpl = {
      createConnection: vi.fn(() => sock),
    } as unknown as typeof import('node:net');
    const ex = createDefaultExecutors({ netImpl });
    const r = await ex.checkPortReachable!('127.0.0.1', 7000);
    expect(r.reachable).toBe(true);
    expect(sock.destroy).toHaveBeenCalled();
  });

  it('returns not reachable on error', async () => {
    const sock = makeFakeSocket({ simulate: 'error' });
    const netImpl = {
      createConnection: vi.fn(() => sock),
    } as unknown as typeof import('node:net');
    const ex = createDefaultExecutors({ netImpl });
    const r = await ex.checkPortReachable!('example.invalid', 9);
    expect(r.reachable).toBe(false);
    expect(r.detail).toMatch(/ECONNREFUSED/);
  });

  it('times out on hang', async () => {
    vi.useFakeTimers();
    try {
      const sock = makeFakeSocket({ simulate: 'hang' });
      const netImpl = {
        createConnection: vi.fn(() => sock),
      } as unknown as typeof import('node:net');
      const ex = createDefaultExecutors({ netImpl });
      const p = ex.checkPortReachable!('10.255.255.1', 81);
      await vi.advanceTimersByTimeAsync(2500);
      const r = await p;
      expect(r.reachable).toBe(false);
      expect(r.detail).toMatch(/timeout/i);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('checkNginxBinary', () => {
  it('parses nginx version from stderr', async () => {
    const proc = makeFakeProc();
    const spawnImpl = vi.fn(() => proc);
    const ex = createDefaultExecutors({
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    const p = ex.checkNginxBinary!('/usr/sbin/nginx');
    setImmediate(() => {
      proc.stderr.push('nginx version: nginx/1.24.0\n');
      proc.stderr.push(null);
      proc._exit(0);
    });
    const r = await p;
    expect(r.present).toBe(true);
    expect(r.version).toBe('nginx/1.24.0');
    expect(spawnImpl).toHaveBeenCalledWith('/usr/sbin/nginx', ['-v']);
  });

  it('defaults to `nginx` when no path supplied', async () => {
    const proc = makeFakeProc();
    const spawnImpl = vi.fn(() => proc);
    const ex = createDefaultExecutors({
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    const p = ex.checkNginxBinary!();
    setImmediate(() => {
      proc.stderr.push('nginx version: nginx/1.25.3\n');
      proc._exit(0);
    });
    await p;
    expect(spawnImpl).toHaveBeenCalledWith('nginx', ['-v']);
  });

  it('returns not present on spawn error', async () => {
    const proc = makeFakeProc();
    const spawnImpl = vi.fn(() => proc);
    const ex = createDefaultExecutors({
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    const p = ex.checkNginxBinary!();
    setImmediate(() => proc._error(new Error('ENOENT')));
    const r = await p;
    expect(r.present).toBe(false);
    expect(r.detail).toMatch(/ENOENT/);
  });

  it('returns not present on non-zero exit with no version', async () => {
    const proc = makeFakeProc();
    const spawnImpl = vi.fn(() => proc);
    const ex = createDefaultExecutors({
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    const p = ex.checkNginxBinary!();
    setImmediate(() => {
      proc.stderr.push('command not found\n');
      proc._exit(127);
    });
    const r = await p;
    expect(r.present).toBe(false);
  });
});

describe('checkNginxManagedDir', () => {
  it('returns writable when access succeeds', async () => {
    const fsImpl = {
      access: vi.fn().mockResolvedValue(undefined),
    };
    const ex = createDefaultExecutors({ fsImpl });
    const r = await ex.checkNginxManagedDir!('/etc/nginx/conf.d');
    expect(r.writable).toBe(true);
    expect(fsImpl.access).toHaveBeenCalledWith('/etc/nginx/conf.d', expect.any(Number));
  });

  it('returns not writable with detail on ENOENT/EACCES', async () => {
    const fsImpl = {
      access: vi.fn().mockRejectedValue(new Error('EACCES: permission denied')),
    };
    const ex = createDefaultExecutors({ fsImpl });
    const r = await ex.checkNginxManagedDir!('/root/not-writable');
    expect(r.writable).toBe(false);
    expect(r.detail).toMatch(/EACCES/);
  });
});

describe('checkMongoConnection', () => {
  it('returns connected when connectDB resolves', async () => {
    const connect = vi.fn().mockResolvedValue(undefined);
    const ex = createDefaultExecutors({ connectDB: connect });
    const r = await ex.checkMongoConnection!();
    expect(r.connected).toBe(true);
    expect(connect).toHaveBeenCalled();
  });

  it('returns not connected with detail when connectDB rejects', async () => {
    const connect = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const ex = createDefaultExecutors({ connectDB: connect });
    const r = await ex.checkMongoConnection!();
    expect(r.connected).toBe(false);
    expect(r.detail).toMatch(/ECONNREFUSED/);
  });
});

describe('checkDiskFree', () => {
  it('computes free MB from statfs', async () => {
    const fsImpl = {
      access: vi.fn(),
      stat: vi.fn(),
      statfs: vi.fn().mockResolvedValue({ bavail: 1000, bsize: 4096 }),
    };
    const ex = createDefaultExecutors({ fsImpl });
    const r = await ex.checkDiskFree!('/', 1);
    // bytes = 1000 * 4096 = 4_096_000; freeMb = 3
    expect(r.freeMb).toBe(3);
    expect(r.ok).toBe(true);
  });

  it('returns ok=false when below threshold', async () => {
    const fsImpl = {
      access: vi.fn(),
      stat: vi.fn(),
      statfs: vi.fn().mockResolvedValue({ bavail: 10, bsize: 4096 }),
    };
    const ex = createDefaultExecutors({ fsImpl });
    const r = await ex.checkDiskFree!('/', 500);
    expect(r.ok).toBe(false);
  });

  it('returns stub above threshold when statfs unavailable', async () => {
    const fsImpl = {
      access: vi.fn(),
      // no statfs
    };
    const ex = createDefaultExecutors({ fsImpl });
    const r = await ex.checkDiskFree!('/', 500);
    expect(r.ok).toBe(true);
    expect(r.freeMb).toBeGreaterThan(500);
  });

  it('returns ok=false when statfs throws', async () => {
    const fsImpl = {
      access: vi.fn(),
      statfs: vi.fn().mockRejectedValue(new Error('EIO')),
    };
    const ex = createDefaultExecutors({ fsImpl });
    const r = await ex.checkDiskFree!('/', 500);
    expect(r.ok).toBe(false);
    expect(r.freeMb).toBe(0);
  });
});

describe('checkDns', () => {
  it('returns resolves=true with records', async () => {
    const dnsImpl = {
      resolve4: vi.fn().mockResolvedValue(['1.2.3.4', '5.6.7.8']),
    } as unknown as typeof import('node:dns/promises');
    const ex = createDefaultExecutors({ dnsImpl });
    const r = await ex.checkDns!('hub.example.com');
    expect(r.resolves).toBe(true);
    expect(r.records).toEqual(['1.2.3.4', '5.6.7.8']);
  });

  it('returns resolves=false when resolver throws', async () => {
    const dnsImpl = {
      resolve4: vi.fn().mockRejectedValue(new Error('ENOTFOUND')),
    } as unknown as typeof import('node:dns/promises');
    const ex = createDefaultExecutors({ dnsImpl });
    const r = await ex.checkDns!('no.such.invalid');
    expect(r.resolves).toBe(false);
    expect(r.detail).toMatch(/ENOTFOUND/);
  });

  it('returns resolves=false when no records', async () => {
    const dnsImpl = {
      resolve4: vi.fn().mockResolvedValue([]),
    } as unknown as typeof import('node:dns/promises');
    const ex = createDefaultExecutors({ dnsImpl });
    const r = await ex.checkDns!('no.such');
    expect(r.resolves).toBe(false);
  });
});

describe('checkTlsCertificate', () => {
  it('returns present:false when cert file missing', async () => {
    const fsImpl = {
      access: vi.fn(),
      stat: vi.fn().mockRejectedValue(new Error('ENOENT: no such file')),
    };
    const ex = createDefaultExecutors({ fsImpl, tlsDir: '/tls' });
    const r = await ex.checkTlsCertificate!('hub.example.com');
    expect(r.present).toBe(false);
    expect(r.detail).toMatch(/ENOENT/);
  });

  it('returns present:true with expiresAt parsed from openssl', async () => {
    const proc = makeFakeProc();
    const spawnImpl = vi.fn(() => proc);
    const fsImpl = {
      access: vi.fn(),
      stat: vi.fn().mockResolvedValue({ size: 2048 }),
    };
    const ex = createDefaultExecutors({
      fsImpl,
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
      tlsDir: '/tls',
    });
    const p = ex.checkTlsCertificate!('hub.example.com');
    setImmediate(() => {
      proc.stdout.push('notAfter=Dec 31 23:59:59 2026 GMT\n');
      proc._exit(0);
    });
    const r = await p;
    expect(r.present).toBe(true);
    expect(r.expiresAt).toBeInstanceOf(Date);
    expect(spawnImpl).toHaveBeenCalledWith(
      'openssl',
      expect.arrayContaining(['x509', '-noout', '-enddate', '-in'])
    );
  });

  it('returns present:true with undefined expiresAt when openssl fails', async () => {
    const proc = makeFakeProc();
    const spawnImpl = vi.fn(() => proc);
    const fsImpl = {
      access: vi.fn(),
      stat: vi.fn().mockResolvedValue({ size: 2048 }),
    };
    const ex = createDefaultExecutors({
      fsImpl,
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
      tlsDir: '/tls',
    });
    const p = ex.checkTlsCertificate!('hub.example.com');
    setImmediate(() => proc._error(new Error('ENOENT')));
    const r = await p;
    expect(r.present).toBe(true);
    expect(r.expiresAt).toBeUndefined();
  });

  it('returns present:true with undefined expiresAt when openssl exits non-zero', async () => {
    const proc = makeFakeProc();
    const spawnImpl = vi.fn(() => proc);
    const fsImpl = {
      access: vi.fn(),
      stat: vi.fn().mockResolvedValue({ size: 2048 }),
    };
    const ex = createDefaultExecutors({
      fsImpl,
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
      tlsDir: '/tls',
    });
    const p = ex.checkTlsCertificate!('hub.example.com');
    setImmediate(() => proc._exit(1));
    const r = await p;
    expect(r.present).toBe(true);
    expect(r.expiresAt).toBeUndefined();
  });
});

describe('detectServiceManager', () => {
  it('returns launchd on darwin', async () => {
    const osImpl = { platform: () => 'darwin' } as unknown as typeof import('node:os');
    const ex = createDefaultExecutors({ osImpl });
    const r = await ex.detectServiceManager!();
    expect(r.manager).toBe('launchd');
  });

  it('returns systemd on linux when systemctl --version succeeds', async () => {
    const osImpl = { platform: () => 'linux' } as unknown as typeof import('node:os');
    const proc = makeFakeProc();
    const spawnImpl = vi.fn(() => proc);
    const ex = createDefaultExecutors({
      osImpl,
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    const p = ex.detectServiceManager!();
    setImmediate(() => proc._exit(0));
    const r = await p;
    expect(r.manager).toBe('systemd');
    expect(spawnImpl).toHaveBeenCalledWith('systemctl', ['--version']);
  });

  it('returns docker on linux when systemctl absent but docker socket exists', async () => {
    const osImpl = { platform: () => 'linux' } as unknown as typeof import('node:os');
    const proc = makeFakeProc();
    const spawnImpl = vi.fn(() => proc);
    const fsImpl = {
      access: vi.fn(),
      stat: vi.fn().mockResolvedValue({ size: 0 }),
    };
    const ex = createDefaultExecutors({
      osImpl,
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
      fsImpl,
    });
    const p = ex.detectServiceManager!();
    setImmediate(() => proc._error(new Error('ENOENT')));
    const r = await p;
    expect(r.manager).toBe('docker');
    expect(fsImpl.stat).toHaveBeenCalledWith('/var/run/docker.sock');
  });

  it('returns unknown on unsupported platform with no docker', async () => {
    const osImpl = { platform: () => 'freebsd' } as unknown as typeof import('node:os');
    const fsImpl = {
      access: vi.fn(),
      stat: vi.fn().mockRejectedValue(new Error('ENOENT')),
    };
    const ex = createDefaultExecutors({ osImpl, fsImpl });
    const r = await ex.detectServiceManager!();
    expect(r.manager).toBe('unknown');
  });
});

describe('checkFrpBinary', () => {
  const origCacheDir = process.env.FLEET_BINARY_CACHE_DIR;
  const origVersion = process.env.FLEET_FRP_VERSION;

  beforeEach(() => {
    process.env.FLEET_BINARY_CACHE_DIR = '/cache';
    process.env.FLEET_FRP_VERSION = '0.58.0';
  });

  afterEach(() => {
    if (origCacheDir === undefined) delete process.env.FLEET_BINARY_CACHE_DIR;
    else process.env.FLEET_BINARY_CACHE_DIR = origCacheDir;
    if (origVersion === undefined) delete process.env.FLEET_FRP_VERSION;
    else process.env.FLEET_FRP_VERSION = origVersion;
  });

  it('returns present:true with version when stat succeeds', async () => {
    const fsImpl = {
      access: vi.fn(),
      stat: vi.fn().mockResolvedValue({ size: 12345 }),
    };
    const ex = createDefaultExecutors({ fsImpl });
    const r = await ex.checkFrpBinary!();
    expect(r.present).toBe(true);
    expect(r.version).toBe('0.58.0');
    // Verify the path looks like `<cache>/<version>/<triple>/frps`
    expect(fsImpl.stat).toHaveBeenCalledWith(expect.stringMatching(/\/cache\/0\.58\.0\/.+\/frps$/));
  });

  it('returns present:false when stat throws', async () => {
    const fsImpl = {
      access: vi.fn(),
      stat: vi.fn().mockRejectedValue(new Error('ENOENT')),
    };
    const ex = createDefaultExecutors({ fsImpl });
    const r = await ex.checkFrpBinary!();
    expect(r.present).toBe(false);
  });

  it('checks the default binary cache when env is not set', async () => {
    delete process.env.FLEET_BINARY_CACHE_DIR;
    delete process.env.FLEET_FRP_VERSION;
    const fsImpl = {
      access: vi.fn(),
      stat: vi.fn().mockRejectedValue(new Error('ENOENT')),
    };
    const ex = createDefaultExecutors({ fsImpl });
    const r = await ex.checkFrpBinary!();
    expect(r.present).toBe(false);
    expect(fsImpl.stat).toHaveBeenCalledWith(
      expect.stringMatching(/\/frp-cache\/[^/]+\/.+\/frps$/)
    );
  });
});
