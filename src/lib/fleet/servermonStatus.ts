import { spawn as realSpawn } from 'node:child_process';
import { readFile as realReadFile } from 'node:fs/promises';
import { z } from 'zod';

export type ServerMonServiceState = 'running' | 'stopped' | 'failed' | 'unknown' | 'missing';
export type ServerMonHealthStatus = 'healthy' | 'unhealthy' | 'unknown';

export interface ServerMonStatus {
  installed: boolean;
  serviceName: string;
  serviceState: ServerMonServiceState;
  serviceEnabled: boolean | 'unknown';
  port: number;
  installDir?: string;
  healthUrl: string;
  healthStatus: ServerMonHealthStatus;
  version?: string;
  lastCheckedAt: string;
  lastError?: string;
}

export const ServerMonStatusZodSchema = z.object({
  installed: z.boolean(),
  serviceName: z.string().default('servermon.service'),
  serviceState: z.enum(['running', 'stopped', 'failed', 'unknown', 'missing']),
  serviceEnabled: z.union([z.boolean(), z.literal('unknown')]),
  port: z.number().int().min(1).max(65535),
  installDir: z.string().optional(),
  healthUrl: z.string(),
  healthStatus: z.enum(['healthy', 'unhealthy', 'unknown']),
  version: z.string().optional(),
  lastCheckedAt: z.string(),
  lastError: z.string().optional(),
});

interface SpawnLike {
  stdout?: { on: (event: 'data', cb: (chunk: Buffer | string) => void) => unknown };
  stderr?: { on: (event: 'data', cb: (chunk: Buffer | string) => void) => unknown };
  on: (event: 'close' | 'error', cb: (...args: never[]) => void) => unknown;
}

type SpawnImpl = typeof realSpawn;

const DEFAULT_PORT = 8912;
const SERVICE_NAME = 'servermon.service';

function parseKeyValueLines(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const index = line.indexOf('=');
    if (index <= 0) continue;
    out[line.slice(0, index)] = line.slice(index + 1);
  }
  return out;
}

function toServiceState(
  activeState: string | undefined,
  installed: boolean
): ServerMonServiceState {
  if (!installed) return 'missing';
  if (activeState === 'active') return 'running';
  if (activeState === 'failed') return 'failed';
  if (activeState === 'inactive') return 'stopped';
  if (activeState === 'activating') return 'running';
  return 'unknown';
}

function toServiceEnabled(unitFileState: string | undefined): boolean | 'unknown' {
  if (unitFileState === 'enabled') return true;
  if (unitFileState === 'disabled') return false;
  return 'unknown';
}

function commandOutput(
  spawnImpl: SpawnImpl,
  command: string,
  args: string[],
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    let child: SpawnLike;
    try {
      child = spawnImpl(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      }) as unknown as SpawnLike;
    } catch (err) {
      resolve({
        stdout: '',
        stderr: err instanceof Error ? err.message : String(err),
        code: 1,
      });
      return;
    }

    let settled = false;
    let stdout = '';
    let stderr = '';
    const finish = (code: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    };
    const timer = setTimeout(() => finish(124), timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('close', (code?: number) => finish(code ?? null));
    child.on('error', (err?: Error) => {
      stderr += err?.message ?? 'spawn error';
      finish(1);
    });
  });
}

export function parseServerMonEnv(raw: string | undefined): { port: number } {
  if (!raw) return { port: DEFAULT_PORT };
  const parsed = parseKeyValueLines(raw);
  const port = Number(parsed.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { port: DEFAULT_PORT };
  }
  return { port };
}

export function parseSystemctlShow(raw: string): {
  installed: boolean;
  serviceState: ServerMonServiceState;
  serviceEnabled: boolean | 'unknown';
  installDir?: string;
} {
  const parsed = parseKeyValueLines(raw);
  const installed = parsed.LoadState === 'loaded' || Boolean(parsed.FragmentPath);
  return {
    installed,
    serviceState: toServiceState(parsed.ActiveState, installed),
    serviceEnabled: installed ? toServiceEnabled(parsed.UnitFileState) : 'unknown',
    ...(parsed.WorkingDirectory ? { installDir: parsed.WorkingDirectory } : {}),
  };
}

export async function collectServerMonStatus(
  opts: {
    spawnImpl?: SpawnImpl;
    fetchImpl?: typeof fetch;
    readFile?: (path: string, encoding: 'utf8') => Promise<string>;
    now?: () => Date;
  } = {}
): Promise<ServerMonStatus> {
  const spawnImpl = opts.spawnImpl ?? realSpawn;
  const now = opts.now ?? (() => new Date());
  const checkedAt = now();
  const show = await commandOutput(
    spawnImpl,
    'systemctl',
    [
      'show',
      SERVICE_NAME,
      '--no-page',
      '--property=LoadState,ActiveState,UnitFileState,FragmentPath,WorkingDirectory',
    ],
    5000
  );
  const service = parseSystemctlShow(show.stdout);
  const readFile = opts.readFile ?? realReadFile;
  let envRaw = '';
  try {
    envRaw = await readFile('/etc/servermon/env', 'utf8');
  } catch {
    envRaw = '';
  }
  const { port } = parseServerMonEnv(envRaw);
  const healthUrl = `http://127.0.0.1:${port}/api/health/ping`;
  let healthStatus: ServerMonHealthStatus = service.installed ? 'unhealthy' : 'unknown';
  let lastError = show.stderr.trim() || undefined;

  if (service.installed) {
    const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    if (fetchImpl) {
      try {
        const res = await fetchImpl(healthUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        healthStatus = res.ok ? 'healthy' : 'unhealthy';
        if (!res.ok) {
          lastError = `health probe returned HTTP ${res.status}`;
        }
      } catch (err) {
        healthStatus = 'unhealthy';
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  return {
    installed: service.installed,
    serviceName: SERVICE_NAME,
    serviceState: service.serviceState,
    serviceEnabled: service.serviceEnabled,
    port,
    ...(service.installDir ? { installDir: service.installDir } : {}),
    healthUrl,
    healthStatus,
    lastCheckedAt: checkedAt.toISOString(),
    ...(lastError ? { lastError } : {}),
  };
}
