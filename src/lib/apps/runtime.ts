import { execFile } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'node:util';
import type { AppLogEntry, AppRuntimeSnapshot } from '@/modules/apps/types';
import { toSystemdServiceName } from './rendering';

const execFileAsync = promisify(execFile);
const UNSET_SYSTEMD_MEMORY = 18446744073709551615;

export type RuntimeCommandRunner = (
  command: string,
  args: string[],
  timeoutMs?: number
) => Promise<string>;

const defaultRuntimeCommandRunner: RuntimeCommandRunner = async (
  command,
  args,
  timeoutMs = 10000
) => {
  const { stdout } = await execFileAsync(command, args, {
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
};

export function toAppLogServiceEntry(slug: string): { serviceName: string } {
  return { serviceName: toSystemdServiceName(slug) };
}

function parseKeyValueLines(raw: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const index = line.indexOf('=');
    if (index <= 0) continue;
    values[line.slice(0, index)] = line.slice(index + 1);
  }
  return values;
}

function parseDateMs(value?: string): number {
  if (!value || value === 'n/a') return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parseSystemdRuntimeSnapshot(
  serviceName: string,
  raw: string,
  options: {
    totalMemoryBytes?: number;
    nowMs?: number;
    checkedAt?: string;
  } = {}
): AppRuntimeSnapshot {
  const kv = parseKeyValueLines(raw);
  const nowMs = options.nowMs ?? Date.now();
  const activeEnterMs = parseDateMs(kv.ActiveEnterTimestamp);
  const memoryCurrent = Number(kv.MemoryCurrent) || 0;
  const memoryBytes = memoryCurrent === UNSET_SYSTEMD_MEMORY ? 0 : memoryCurrent;
  const totalMemoryBytes = options.totalMemoryBytes ?? os.totalmem();
  const cpuNs = Number(kv.CPUUsageNSec) || 0;

  return {
    available: true,
    serviceName,
    activeState: kv.ActiveState || 'unknown',
    subState: kv.SubState || 'unknown',
    mainPid: Number(kv.MainPID) || 0,
    cpuPercent: cpuNs > 0 ? Math.min(100, roundPercent(cpuNs / 1e9 / 10)) : 0,
    memoryBytes,
    memoryPercent:
      memoryBytes > 0 && totalMemoryBytes > 0
        ? roundPercent((memoryBytes / totalMemoryBytes) * 100)
        : 0,
    uptimeSeconds:
      kv.ActiveState === 'active' && activeEnterMs > 0
        ? Math.max(0, Math.floor((nowMs - activeEnterMs) / 1000))
        : 0,
    restartCount: Number(kv.NRestarts) || 0,
    checkedAt: options.checkedAt ?? new Date(nowMs).toISOString(),
  };
}

function mapJournalPriority(priority: number): AppLogEntry['priority'] {
  const map: Record<number, AppLogEntry['priority']> = {
    0: 'emerg',
    1: 'alert',
    2: 'crit',
    3: 'err',
    4: 'warning',
    5: 'notice',
    6: 'info',
    7: 'debug',
  };
  return map[priority] || 'info';
}

export function parseJournalJsonLogs(raw: string, serviceName: string): AppLogEntry[] {
  const entries: AppLogEntry[] = [];

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      const timestamp =
        typeof parsed.__REALTIME_TIMESTAMP === 'string'
          ? new Date(Number(parsed.__REALTIME_TIMESTAMP) / 1000).toISOString()
          : new Date().toISOString();
      const pid = Number(parsed._PID);
      entries.push({
        timestamp,
        priority: mapJournalPriority(Number(parsed.PRIORITY) || 6),
        message: typeof parsed.MESSAGE === 'string' ? parsed.MESSAGE : '',
        unit: serviceName,
        ...(Number.isFinite(pid) && pid > 0 ? { pid } : {}),
      });
    } catch {
      // journalctl can occasionally emit non-JSON warnings; skip them.
    }
  }

  return entries;
}

export async function getManagedAppRuntime(
  app: { slug: string },
  commandRunner: RuntimeCommandRunner = defaultRuntimeCommandRunner
): Promise<AppRuntimeSnapshot> {
  const serviceName = toSystemdServiceName(app.slug);
  const checkedAt = new Date().toISOString();

  try {
    const raw = await commandRunner('systemctl', [
      'show',
      serviceName,
      '--property=Id,ActiveState,SubState,MainPID,MemoryCurrent,CPUUsageNSec,NRestarts,ActiveEnterTimestamp',
    ]);
    return parseSystemdRuntimeSnapshot(serviceName, raw, { checkedAt });
  } catch (error: unknown) {
    return {
      available: false,
      serviceName,
      checkedAt,
      error: error instanceof Error ? error.message : 'Runtime inspection unavailable',
    };
  }
}

export async function getManagedAppLogs(
  app: { slug: string },
  lines = 200,
  commandRunner: RuntimeCommandRunner = defaultRuntimeCommandRunner
): Promise<AppLogEntry[]> {
  const serviceName = toSystemdServiceName(app.slug);
  const raw = await commandRunner(
    'journalctl',
    [
      '-u',
      serviceName,
      '-n',
      String(Math.min(Math.max(lines, 1), 500)),
      '--no-pager',
      '-o',
      'json',
    ],
    10000
  );
  return parseJournalJsonLogs(raw, serviceName);
}
