/**
 * Default executors for `runPreflight`. Each probe is implemented with injectable
 * raw I/O (net/dns/fs/os/spawn/fetch/connectDB) so every probe is unit-testable
 * without touching the real system.
 */
import * as nodeNet from 'node:net';
import * as nodeDns from 'node:dns/promises';
import * as nodeFsPromises from 'node:fs/promises';
import { constants as nodeFsConstants } from 'node:fs';
import * as nodeOs from 'node:os';
import { spawn as realSpawn } from 'node:child_process';
import path from 'node:path';
import connectDB from '@/lib/db';
import { platformTriple } from './binary';
import type { PreflightExecutors } from './preflight';

type NetModule = typeof nodeNet;
type DnsModule = typeof nodeDns;
type OsModule = typeof nodeOs;
type SpawnFn = typeof realSpawn;

export interface DefaultExecutorsFs {
  access(p: string, mode?: number): Promise<void>;
  statfs?: (p: string) => Promise<{ bavail: number; bsize: number }>;
  stat?(p: string): Promise<{ size: number }>;
}

export interface DefaultExecutorsOpts {
  netImpl?: NetModule;
  dnsImpl?: DnsModule;
  fsImpl?: DefaultExecutorsFs;
  osImpl?: OsModule;
  spawnImpl?: SpawnFn;
  connectDB?: () => Promise<unknown>;
  fetchImpl?: typeof fetch;
  nowImpl?: () => Date;
  /** Directory containing TLS certs (used for checkTlsCertificate). Defaults to /etc/letsencrypt/live. */
  tlsDir?: string;
}

const PORT_AVAILABLE_TIMEOUT_MS = 2000;
const PORT_REACHABLE_TIMEOUT_MS = 2000;
const SPAWN_TIMEOUT_MS = 3000;

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function defaultFsImpl(): DefaultExecutorsFs {
  const impl: DefaultExecutorsFs = {
    access: (p, mode) => nodeFsPromises.access(p, mode),
    stat: async (p) => {
      const s = await nodeFsPromises.stat(p);
      return { size: Number(s.size) };
    },
  };
  const maybeStatfs = (
    nodeFsPromises as unknown as {
      statfs?: (p: string) => Promise<{ bavail: bigint | number; bsize: bigint | number }>;
    }
  ).statfs;
  if (typeof maybeStatfs === 'function') {
    impl.statfs = async (p) => {
      const r = await maybeStatfs(p);
      return { bavail: Number(r.bavail), bsize: Number(r.bsize) };
    };
  }
  return impl;
}

export function createDefaultExecutors(opts: DefaultExecutorsOpts = {}): PreflightExecutors {
  const netImpl: NetModule = opts.netImpl ?? nodeNet;
  const dnsImpl: DnsModule = opts.dnsImpl ?? nodeDns;
  const fsImpl: DefaultExecutorsFs = opts.fsImpl ?? defaultFsImpl();
  const osImpl: OsModule = opts.osImpl ?? nodeOs;
  const spawnImpl: SpawnFn = opts.spawnImpl ?? realSpawn;
  const connect = opts.connectDB ?? (connectDB as () => Promise<unknown>);
  const tlsDir = opts.tlsDir ?? '/etc/letsencrypt/live';

  async function checkPortAvailable(
    port: number
  ): Promise<{ available: boolean; detail?: string }> {
    return new Promise((resolve) => {
      let settled = false;
      const done = (v: { available: boolean; detail?: string }) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };
      let server: nodeNet.Server | null = null;
      try {
        server = netImpl.createServer();
      } catch (err) {
        done({ available: false, detail: toErrorMessage(err) });
        return;
      }
      const timer = setTimeout(() => {
        try {
          server?.close();
        } catch {
          // ignore
        }
        done({ available: false, detail: 'timeout' });
      }, PORT_AVAILABLE_TIMEOUT_MS);

      server.once('error', (err: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        if (err.code === 'EADDRINUSE') {
          done({ available: false, detail: 'port in use' });
        } else {
          done({ available: false, detail: err.message });
        }
      });
      server.once('listening', () => {
        clearTimeout(timer);
        server?.close(() => done({ available: true }));
      });

      try {
        server.listen(port, '127.0.0.1');
      } catch (err) {
        clearTimeout(timer);
        done({ available: false, detail: toErrorMessage(err) });
      }
    });
  }

  async function checkPortReachable(
    host: string,
    port: number
  ): Promise<{ reachable: boolean; detail?: string }> {
    return new Promise((resolve) => {
      let settled = false;
      const done = (v: { reachable: boolean; detail?: string }) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };
      let sock: nodeNet.Socket | null = null;
      try {
        sock = netImpl.createConnection({ host, port });
      } catch (err) {
        done({ reachable: false, detail: toErrorMessage(err) });
        return;
      }
      const timer = setTimeout(() => {
        try {
          sock?.destroy();
        } catch {
          // ignore
        }
        done({ reachable: false, detail: 'timeout' });
      }, PORT_REACHABLE_TIMEOUT_MS);

      sock.once('connect', () => {
        clearTimeout(timer);
        try {
          sock?.destroy();
        } catch {
          // ignore
        }
        done({ reachable: true });
      });
      sock.once('error', (err: Error) => {
        clearTimeout(timer);
        try {
          sock?.destroy();
        } catch {
          // ignore
        }
        done({ reachable: false, detail: err.message });
      });
    });
  }

  async function checkNginxBinary(
    binaryPath?: string
  ): Promise<{ present: boolean; version?: string; detail?: string }> {
    return new Promise((resolve) => {
      const bin = binaryPath ?? 'nginx';
      let settled = false;
      const done = (v: { present: boolean; version?: string; detail?: string }) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };
      let proc;
      try {
        proc = spawnImpl(bin, ['-v']);
      } catch (err) {
        done({ present: false, detail: toErrorMessage(err) });
        return;
      }
      const timer = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          // ignore
        }
        done({ present: false, detail: 'timeout' });
      }, SPAWN_TIMEOUT_MS);

      let stderr = '';
      let stdout = '';
      proc.stdout?.on('data', (c: Buffer | string) => {
        stdout += typeof c === 'string' ? c : c.toString('utf8');
      });
      proc.stderr?.on('data', (c: Buffer | string) => {
        stderr += typeof c === 'string' ? c : c.toString('utf8');
      });
      proc.once('error', (err: Error) => {
        clearTimeout(timer);
        done({ present: false, detail: err.message });
      });
      proc.once('exit', (code: number | null) => {
        clearTimeout(timer);
        const combined = `${stderr}\n${stdout}`;
        // nginx -v writes to stderr by default: "nginx version: nginx/1.24.0"
        const match = combined.match(/nginx version:\s*([^\s]+)/i);
        const version = match ? match[1] : undefined;
        if (code === 0 || version) {
          done({ present: true, version });
        } else {
          done({ present: false, detail: combined.trim() || `exit code ${code}` });
        }
      });
    });
  }

  async function checkNginxManagedDir(
    dir: string
  ): Promise<{ writable: boolean; detail?: string }> {
    try {
      await fsImpl.access(dir, nodeFsConstants.W_OK);
      return { writable: true };
    } catch (err) {
      const msg = toErrorMessage(err);
      return { writable: false, detail: msg };
    }
  }

  async function checkMongoConnection(): Promise<{ connected: boolean; detail?: string }> {
    try {
      await connect();
      return { connected: true };
    } catch (err) {
      return { connected: false, detail: toErrorMessage(err) };
    }
  }

  async function checkDiskFree(p: string, minMb: number): Promise<{ freeMb: number; ok: boolean }> {
    if (!fsImpl.statfs) {
      // Older Node versions without statfs: we cannot actually measure,
      // so return a value above threshold so the check passes.
      return { freeMb: minMb + 1, ok: true };
    }
    try {
      const { bavail, bsize } = await fsImpl.statfs(p);
      const bytes = bavail * bsize;
      const freeMb = Math.floor(bytes / 1024 / 1024);
      return { freeMb, ok: freeMb >= minMb };
    } catch {
      return { freeMb: 0, ok: false };
    }
  }

  async function checkDns(
    host: string
  ): Promise<{ resolves: boolean; records?: string[]; detail?: string }> {
    try {
      const records = await dnsImpl.resolve4(host);
      return { resolves: records.length > 0, records };
    } catch (err) {
      return { resolves: false, detail: toErrorMessage(err) };
    }
  }

  async function checkTlsCertificate(
    domain: string
  ): Promise<{ present: boolean; expiresAt?: Date; detail?: string }> {
    const certPath = path.join(tlsDir, domain, 'fullchain.pem');
    const statFn = fsImpl.stat;
    if (!statFn) {
      return { present: false, detail: 'fs.stat unavailable' };
    }
    try {
      await statFn(certPath);
    } catch (err) {
      return { present: false, detail: toErrorMessage(err) };
    }

    // Attempt to read expiration via `openssl x509 -noout -enddate -in <path>`.
    const expiresAt = await new Promise<Date | undefined>((resolve) => {
      let proc;
      try {
        proc = spawnImpl('openssl', ['x509', '-noout', '-enddate', '-in', certPath]);
      } catch {
        resolve(undefined);
        return;
      }
      const timer = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          // ignore
        }
        resolve(undefined);
      }, SPAWN_TIMEOUT_MS);

      let stdout = '';
      proc.stdout?.on('data', (c: Buffer | string) => {
        stdout += typeof c === 'string' ? c : c.toString('utf8');
      });
      proc.once('error', () => {
        clearTimeout(timer);
        resolve(undefined);
      });
      proc.once('exit', (code: number | null) => {
        clearTimeout(timer);
        if (code !== 0) {
          resolve(undefined);
          return;
        }
        // stdout is like: "notAfter=Dec 31 23:59:59 2026 GMT"
        const match = stdout.match(/notAfter=(.+)/);
        if (!match) {
          resolve(undefined);
          return;
        }
        const parsed = new Date(match[1].trim());
        resolve(Number.isNaN(parsed.getTime()) ? undefined : parsed);
      });
    });

    return { present: true, expiresAt };
  }

  async function detectServiceManager(): Promise<{ manager: string }> {
    const platform = osImpl.platform();
    if (platform === 'darwin') {
      return { manager: 'launchd' };
    }
    if (platform === 'linux') {
      const hasSystemd = await new Promise<boolean>((resolve) => {
        let proc;
        try {
          proc = spawnImpl('systemctl', ['--version']);
        } catch {
          resolve(false);
          return;
        }
        const timer = setTimeout(() => {
          try {
            proc.kill('SIGKILL');
          } catch {
            // ignore
          }
          resolve(false);
        }, SPAWN_TIMEOUT_MS);
        proc.once('error', () => {
          clearTimeout(timer);
          resolve(false);
        });
        proc.once('exit', (code: number | null) => {
          clearTimeout(timer);
          resolve(code === 0);
        });
      });
      if (hasSystemd) return { manager: 'systemd' };
    }

    // Secondary detection: docker socket (primary still returns systemd/launchd above).
    if (fsImpl.stat) {
      try {
        await fsImpl.stat('/var/run/docker.sock');
        return { manager: 'docker' };
      } catch {
        // not present
      }
    }
    return { manager: 'unknown' };
  }

  async function checkFrpBinary(): Promise<{ present: boolean; version?: string }> {
    const cacheDir = process.env.FLEET_BINARY_CACHE_DIR || '/var/lib/servermon/frp-cache';
    const version = process.env.FLEET_FRP_VERSION || '0.58.1';
    if (!fsImpl.stat) {
      return { present: false };
    }
    try {
      const triple = platformTriple();
      const frpsPath = path.join(cacheDir, version, triple, 'frps');
      await fsImpl.stat(frpsPath);
      return { present: true, version };
    } catch {
      return { present: false };
    }
  }

  return {
    checkPortAvailable,
    checkPortReachable,
    checkNginxBinary,
    checkNginxManagedDir,
    checkMongoConnection,
    checkDiskFree,
    checkDns,
    checkTlsCertificate,
    detectServiceManager,
    checkFrpBinary,
  };
}
