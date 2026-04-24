import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { CertbotProvider, parseCertbotExpiry } from './acme';

interface FakeProc extends EventEmitter {
  pid: number;
  stdout: Readable;
  stderr: Readable;
  kill: ReturnType<typeof vi.fn>;
  _exit: (code: number | null, signal?: NodeJS.Signals | null) => void;
}

function makeFakeProc(): FakeProc {
  const proc = new EventEmitter() as FakeProc;
  proc.pid = 42;
  proc.stdout = new Readable({ read() {} });
  proc.stderr = new Readable({ read() {} });
  proc.kill = vi.fn();
  proc._exit = (code, signal = null) => {
    proc.emit('exit', code, signal);
    proc.emit('close', code, signal);
  };
  return proc;
}

/**
 * Queue a series of spawn responses. Each call to spawnImpl pops the next
 * scripted handler, which receives the FakeProc and should push stdout/stderr
 * data and emit exit on the next tick.
 */
function makeSpawnQueue(handlers: Array<(proc: FakeProc, argv: string[]) => void>) {
  const calls: Array<{ binary: string; args: string[] }> = [];
  const spawnImpl = vi.fn((binary: string, args: string[]) => {
    calls.push({ binary, args });
    const proc = makeFakeProc();
    const h = handlers.shift();
    if (h) {
      setImmediate(() => h(proc, args));
    } else {
      setImmediate(() => proc._exit(0, null));
    }
    return proc as unknown as ReturnType<typeof import('node:child_process').spawn>;
  });
  return { spawnImpl, calls };
}

describe('parseCertbotExpiry', () => {
  it('parses "Expiry Date: ..." format', () => {
    const out = `Certificate Name: foo.example.com
    Expiry Date: 2026-07-15 12:34:56+00:00 (VALID: 89 days)`;
    const d = parseCertbotExpiry(out);
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(2026);
    expect(d!.getUTCMonth()).toBe(6); // July = 6
    expect(d!.getUTCDate()).toBe(15);
  });

  it('parses "Not After: ..." ISO-ish format', () => {
    const out = `  Not After: 2026-07-15T12:34:56Z`;
    const d = parseCertbotExpiry(out);
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe('2026-07-15T12:34:56.000Z');
  });

  it('returns null when no expiry is found', () => {
    expect(parseCertbotExpiry('nothing relevant here')).toBeNull();
  });
});

describe('CertbotProvider.ensureCertificate', () => {
  it('passes expected argv for webroot + staging + email', async () => {
    const { spawnImpl, calls } = makeSpawnQueue([
      // certonly
      (p) => p._exit(0, null),
      // certificates -d <domain>
      (p) => {
        p.stdout.push('Certificate Name: test.example.com\n');
        p.stdout.push('    Expiry Date: 2026-07-15 12:34:56+00:00 (VALID)\n');
        p.stdout.push(null);
        p._exit(0, null);
      },
    ]);
    const provider = new CertbotProvider({
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
      certbotBinary: '/usr/bin/certbot',
      liveDir: '/etc/letsencrypt/live',
      email: 'ops@example.com',
      webrootPath: '/var/www/html',
      staging: true,
    });
    const info = await provider.ensureCertificate('test.example.com');
    expect(calls[0].binary).toBe('/usr/bin/certbot');
    expect(calls[0].args).toEqual([
      'certonly',
      '--non-interactive',
      '--agree-tos',
      '-m',
      'ops@example.com',
      '-d',
      'test.example.com',
      '--webroot',
      '-w',
      '/var/www/html',
      '--staging',
    ]);
    expect(calls[1].binary).toBe('/usr/bin/certbot');
    expect(calls[1].args).toEqual(['certificates', '-d', 'test.example.com']);
    expect(info.certPath).toBe('/etc/letsencrypt/live/test.example.com/fullchain.pem');
    expect(info.keyPath).toBe('/etc/letsencrypt/live/test.example.com/privkey.pem');
    expect(info.expiresAt.toISOString()).toBe('2026-07-15T12:34:56.000Z');
  });

  it('uses --standalone when no webrootPath provided', async () => {
    const { spawnImpl, calls } = makeSpawnQueue([
      (p) => p._exit(0, null),
      (p) => {
        p.stdout.push('    Expiry Date: 2026-07-15 12:34:56+00:00\n');
        p.stdout.push(null);
        p._exit(0, null);
      },
    ]);
    const provider = new CertbotProvider({
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
      email: 'ops@example.com',
    });
    await provider.ensureCertificate('foo.example.com');
    expect(calls[0].args).toEqual([
      'certonly',
      '--non-interactive',
      '--agree-tos',
      '-m',
      'ops@example.com',
      '-d',
      'foo.example.com',
      '--standalone',
    ]);
  });

  it('rejects when certonly exits non-zero', async () => {
    const { spawnImpl } = makeSpawnQueue([
      (p) => {
        p.stderr.push('boom\n');
        p.stderr.push(null);
        p._exit(1, null);
      },
    ]);
    const provider = new CertbotProvider({
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
      email: 'ops@example.com',
    });
    await expect(provider.ensureCertificate('bad.example.com')).rejects.toThrow(
      /certbot certonly failed/
    );
  });
});

describe('CertbotProvider.renewIfNeeded', () => {
  it('skips renew when current expiry is far beyond thresholdDays', async () => {
    // Only one call expected: `certificates -d <domain>` with an expiry > 30 days.
    const future = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = `${future.getUTCFullYear()}-${pad(
      future.getUTCMonth() + 1
    )}-${pad(future.getUTCDate())} 12:00:00+00:00`;
    const { spawnImpl, calls } = makeSpawnQueue([
      (p) => {
        p.stdout.push(`Expiry Date: ${fmt}\n`);
        p.stdout.push(null);
        p._exit(0, null);
      },
    ]);
    const provider = new CertbotProvider({
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    const r = await provider.renewIfNeeded('test.example.com');
    expect(r.renewed).toBe(false);
    expect(calls.length).toBe(1);
    expect(calls[0].args).toEqual(['certificates', '-d', 'test.example.com']);
  });

  it('renewed=true when stdout contains renewal marker', async () => {
    // Expiry soon -> triggers renew. Then re-read expiry afterwards.
    const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const soonFmt = `${soon.getUTCFullYear()}-${pad(
      soon.getUTCMonth() + 1
    )}-${pad(soon.getUTCDate())} 12:00:00+00:00`;
    const future = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const futureFmt = `${future.getUTCFullYear()}-${pad(
      future.getUTCMonth() + 1
    )}-${pad(future.getUTCDate())} 12:00:00+00:00`;
    const { spawnImpl, calls } = makeSpawnQueue([
      (p) => {
        p.stdout.push(`Expiry Date: ${soonFmt}\n`);
        p.stdout.push(null);
        p._exit(0, null);
      },
      (p) => {
        p.stdout.push('Congratulations, all renewals succeeded\n');
        p.stdout.push(null);
        p._exit(0, null);
      },
      (p) => {
        p.stdout.push(`Expiry Date: ${futureFmt}\n`);
        p.stdout.push(null);
        p._exit(0, null);
      },
    ]);
    const provider = new CertbotProvider({
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    const r = await provider.renewIfNeeded('foo.example.com');
    expect(r.renewed).toBe(true);
    expect(calls[1].args).toEqual(['renew', '--cert-name', 'foo.example.com', '--non-interactive']);
  });

  it('renewed=false when renew output lacks renewal marker', async () => {
    const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const soonFmt = `${soon.getUTCFullYear()}-${pad(
      soon.getUTCMonth() + 1
    )}-${pad(soon.getUTCDate())} 12:00:00+00:00`;
    const { spawnImpl } = makeSpawnQueue([
      (p) => {
        p.stdout.push(`Expiry Date: ${soonFmt}\n`);
        p.stdout.push(null);
        p._exit(0, null);
      },
      (p) => {
        p.stdout.push('nothing to do\n');
        p.stdout.push(null);
        p._exit(0, null);
      },
      (p) => {
        p.stdout.push(`Expiry Date: ${soonFmt}\n`);
        p.stdout.push(null);
        p._exit(0, null);
      },
    ]);
    const provider = new CertbotProvider({
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    const r = await provider.renewIfNeeded('foo.example.com');
    expect(r.renewed).toBe(false);
  });
});

describe('CertbotProvider.revoke', () => {
  it('sends revoke argv', async () => {
    const { spawnImpl, calls } = makeSpawnQueue([(p) => p._exit(0, null)]);
    const provider = new CertbotProvider({
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    await provider.revoke('gone.example.com');
    expect(calls[0].args).toEqual([
      'revoke',
      '--cert-name',
      'gone.example.com',
      '--non-interactive',
    ]);
  });

  it('rejects on non-zero exit', async () => {
    const { spawnImpl } = makeSpawnQueue([
      (p) => {
        p.stderr.push('no such cert\n');
        p.stderr.push(null);
        p._exit(1, null);
      },
    ]);
    const provider = new CertbotProvider({
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    await expect(provider.revoke('gone.example.com')).rejects.toThrow(/certbot revoke failed/);
  });
});
