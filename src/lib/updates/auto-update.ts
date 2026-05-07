import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import { systemUpdateService } from '@/lib/updates/system-service';
import type { LocalAutoUpdateTarget } from '@/types/updates';

const execFileAsync = promisify(execFile);
const log = createLogger('auto-update');
const DEFAULT_CONFIG_PATH = '/etc/servermon/auto-update.json';
const DEFAULT_AGENT_CONFIG_PATH = '/etc/servermon/agent-auto-update.json';
const DEFAULT_TIME = '03:00';
const DEFAULT_GRACE_MINUTES = 120;
const DEFAULT_MAX_RETRIES = 1;

const TimeZ = z
  .string()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm time')
  .transform(normalizeTime);

export const AutoUpdateSettingsZ = z.object({
  enabled: z.boolean().default(false),
  time: TimeZ.default(DEFAULT_TIME),
  timezone: z.string().min(1).default(getSystemTimezone),
  missedRunGraceMinutes: z.number().int().min(1).default(DEFAULT_GRACE_MINUTES),
  missedRunMaxRetries: z.number().int().min(1).default(DEFAULT_MAX_RETRIES),
  lastScheduledDateLaunched: z.string().optional(),
  lastSkippedDate: z.string().optional(),
  lastCatchUpDateAttempted: z.string().optional(),
  activeRunId: z.string().optional(),
  lastRunStatus: z.enum(['running', 'completed', 'failed', 'skipped']).optional(),
  lastRunAt: z.string().optional(),
  lastRunMessage: z.string().optional(),
});

export type AutoUpdateSettings = z.infer<typeof AutoUpdateSettingsZ>;

export interface AutoUpdateScheduleState {
  enabled: boolean;
  nextRunAt: string | null;
  localDate: string;
  localTime: string;
  timezone: string;
}

export type AutoUpdateDecision =
  | {
      shouldLaunch: true;
      kind: 'scheduled' | 'catch-up';
      scheduledDate: string;
    }
  | {
      shouldLaunch: false;
      reason:
        | 'disabled'
        | 'active-run'
        | 'already-launched'
        | 'already-skipped'
        | 'not-due'
        | 'outside-grace'
        | 'catch-up-already-attempted';
      scheduledDate?: string;
    };

export type RepoUpdateCheck =
  | { status: 'changed'; localRef: string; upstreamRef: string }
  | { status: 'unchanged'; localRef: string; upstreamRef: string }
  | { status: 'failed'; message: string };

export type AutoUpdateRunResult =
  | { launched: true; runId?: string; scheduledDate: string; kind: 'scheduled' | 'catch-up' }
  | { launched: false; reason: string; scheduledDate?: string; runId?: string };

interface LocalParts {
  date: string;
  time: string;
  minutes: number;
}

function getAutoUpdateConfigPath(target: LocalAutoUpdateTarget = 'servermon'): string {
  if (target === 'agent') {
    return process.env.SERVERMON_AGENT_AUTO_UPDATE_CONFIG || DEFAULT_AGENT_CONFIG_PATH;
  }
  return process.env.SERVERMON_AUTO_UPDATE_CONFIG || DEFAULT_CONFIG_PATH;
}

function getSystemTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function getDefaultAutoUpdateSettings(): AutoUpdateSettings {
  return AutoUpdateSettingsZ.parse({});
}

export async function loadAutoUpdateSettings(
  target: LocalAutoUpdateTarget = 'servermon'
): Promise<AutoUpdateSettings> {
  try {
    const raw = await readFile(getAutoUpdateConfigPath(target), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return AutoUpdateSettingsZ.parse(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.warn('Failed to load local auto-update settings; using defaults', error);
    }
    return getDefaultAutoUpdateSettings();
  }
}

export async function saveAutoUpdateSettings(
  patch: Partial<AutoUpdateSettings>,
  target: LocalAutoUpdateTarget = 'servermon'
): Promise<AutoUpdateSettings> {
  const current = await loadAutoUpdateSettings(target);
  const next = AutoUpdateSettingsZ.parse({ ...current, ...patch });
  const path = getAutoUpdateConfigPath(target);
  await mkdir(dirname(path), { recursive: true, mode: 0o755 });
  await writeFile(path, JSON.stringify(next, null, 2) + '\n', { mode: 0o644 });
  return next;
}

export function getAutoUpdateScheduleState(
  settings: AutoUpdateSettings,
  now = new Date()
): AutoUpdateScheduleState {
  const local = getLocalParts(now, settings.timezone);
  return {
    enabled: settings.enabled,
    nextRunAt: settings.enabled ? getNextRunAt(settings, now).toISOString() : null,
    localDate: local.date,
    localTime: local.time,
    timezone: settings.timezone,
  };
}

export function shouldLaunchAutoUpdate(
  settings: AutoUpdateSettings,
  now = new Date(),
  activeRunStillRunning = false
): AutoUpdateDecision {
  const local = getLocalParts(now, settings.timezone);

  if (!settings.enabled) return { shouldLaunch: false, reason: 'disabled' };
  if (activeRunStillRunning || settings.lastRunStatus === 'running') {
    return { shouldLaunch: false, reason: 'active-run', scheduledDate: local.date };
  }

  if (settings.lastScheduledDateLaunched === local.date) {
    return { shouldLaunch: false, reason: 'already-launched', scheduledDate: local.date };
  }
  if (settings.lastSkippedDate === local.date) {
    return { shouldLaunch: false, reason: 'already-skipped', scheduledDate: local.date };
  }

  const scheduledMinutes = timeToMinutes(settings.time);
  const diffMinutes = local.minutes - scheduledMinutes;

  if (diffMinutes === 0) {
    return { shouldLaunch: true, kind: 'scheduled', scheduledDate: local.date };
  }
  if (diffMinutes < 0) {
    return { shouldLaunch: false, reason: 'not-due', scheduledDate: local.date };
  }
  if (diffMinutes > settings.missedRunGraceMinutes) {
    return { shouldLaunch: false, reason: 'outside-grace', scheduledDate: local.date };
  }
  if (settings.lastCatchUpDateAttempted === local.date) {
    return {
      shouldLaunch: false,
      reason: 'catch-up-already-attempted',
      scheduledDate: local.date,
    };
  }

  return { shouldLaunch: true, kind: 'catch-up', scheduledDate: local.date };
}

export async function checkRepoForUpdates(repoDir: string): Promise<RepoUpdateCheck> {
  try {
    await execFileAsync('git', ['-C', repoDir, 'fetch', '--quiet'], { timeout: 30000 });
    const local = await execFileAsync('git', ['-C', repoDir, 'rev-parse', 'HEAD'], {
      timeout: 10000,
    });
    const upstream = await execFileAsync('git', ['-C', repoDir, 'rev-parse', '@{u}'], {
      timeout: 10000,
    });
    const localRef = String(local.stdout).trim();
    const upstreamRef = String(upstream.stdout).trim();
    return localRef === upstreamRef
      ? { status: 'unchanged', localRef, upstreamRef }
      : { status: 'changed', localRef, upstreamRef };
  } catch (error) {
    return {
      status: 'failed',
      message:
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'Failed to check repository updates',
    };
  }
}

export async function runLocalAutoUpdateOnce(
  targetOrNow: LocalAutoUpdateTarget | Date = 'servermon',
  maybeNow = new Date()
): Promise<AutoUpdateRunResult> {
  const target = targetOrNow instanceof Date ? 'servermon' : targetOrNow;
  const now = targetOrNow instanceof Date ? targetOrNow : maybeNow;
  let settings = await loadAutoUpdateSettings(target);
  let activeRunStillRunning = false;

  if (settings.activeRunId) {
    const active = await systemUpdateService.getUpdateRunDetails(settings.activeRunId);
    activeRunStillRunning = active?.status === 'running';
    if (!activeRunStillRunning) {
      settings = await saveAutoUpdateSettings(
        {
          activeRunId: undefined,
          lastRunStatus: active?.status,
        },
        target
      );
    }
  }

  const decision = shouldLaunchAutoUpdate(settings, now, activeRunStillRunning);
  if (!decision.shouldLaunch) {
    return {
      launched: false,
      reason: decision.reason,
      scheduledDate: decision.scheduledDate,
    };
  }

  if (decision.kind === 'catch-up') {
    settings = await saveAutoUpdateSettings(
      {
        lastCatchUpDateAttempted: decision.scheduledDate,
      },
      target
    );
  }

  if (target === 'agent') {
    return runAgentAutoUpdate(decision, now, target);
  }

  return runServerMonAutoUpdate(decision, now, target);
}

async function runServerMonAutoUpdate(
  decision: Extract<AutoUpdateDecision, { shouldLaunch: true }>,
  now: Date,
  target: LocalAutoUpdateTarget
): Promise<AutoUpdateRunResult> {
  const servermonRepo = process.env.SERVERMON_REPO_DIR || '/opt/servermon/repo';
  const servermonCheck = await checkRepoForUpdates(servermonRepo);
  if (servermonCheck.status === 'failed') {
    await saveAutoUpdateSettings(
      {
        lastRunStatus: 'failed',
        lastRunAt: now.toISOString(),
        lastRunMessage: `ServerMon check failed: ${servermonCheck.message}`,
      },
      target
    );
    return {
      launched: false,
      reason: 'servermon-check-failed',
      scheduledDate: decision.scheduledDate,
    };
  }

  const servermonNeedsUpdate = servermonCheck.status === 'changed';
  if (!servermonNeedsUpdate) {
    const run = await systemUpdateService.recordSkippedUpdateRun(
      'ServerMon app auto-update skipped: no upstream changes detected',
      'servermon',
      'scheduled'
    );
    await saveAutoUpdateSettings(
      {
        lastSkippedDate: decision.scheduledDate,
        lastRunStatus: 'skipped',
        lastRunAt: now.toISOString(),
        lastRunMessage: 'No upstream changes detected',
      },
      target
    );
    return {
      launched: false,
      reason: 'no-updates',
      scheduledDate: decision.scheduledDate,
      runId: run.runId,
    };
  }

  const launched = await systemUpdateService.triggerUpdate({ trigger: 'scheduled' });

  if (!launched.success) {
    await saveAutoUpdateSettings(
      {
        lastRunStatus: 'failed',
        lastRunAt: now.toISOString(),
        lastRunMessage: launched.message,
      },
      target
    );
    return {
      launched: false,
      reason: 'launch-failed',
      scheduledDate: decision.scheduledDate,
    };
  }

  await saveAutoUpdateSettings(
    {
      activeRunId: launched.runId,
      lastScheduledDateLaunched: decision.scheduledDate,
      lastRunStatus: 'running',
      lastRunAt: now.toISOString(),
      lastRunMessage: 'ServerMon app auto-update launched',
    },
    target
  );

  return {
    launched: true,
    runId: launched.runId,
    scheduledDate: decision.scheduledDate,
    kind: decision.kind,
  };
}

async function runAgentAutoUpdate(
  decision: Extract<AutoUpdateDecision, { shouldLaunch: true }>,
  now: Date,
  target: LocalAutoUpdateTarget
): Promise<AutoUpdateRunResult> {
  const agentStatus = await systemUpdateService.getServermonAgentStatus();
  if (!agentStatus.active || !agentStatus.updateSupported || !agentStatus.repoDir) {
    const run = await systemUpdateService.recordSkippedUpdateRun(
      agentStatus.message || 'Agent auto-update skipped: agent update is not available',
      'agent',
      'scheduled'
    );
    await saveAutoUpdateSettings(
      {
        lastSkippedDate: decision.scheduledDate,
        lastRunStatus: 'skipped',
        lastRunAt: now.toISOString(),
        lastRunMessage: agentStatus.message || 'Agent update is not available',
      },
      target
    );
    return {
      launched: false,
      reason: 'agent-unavailable',
      scheduledDate: decision.scheduledDate,
      runId: run.runId,
    };
  }

  if (agentStatus.installMode !== 'release') {
    const agentCheck = await checkRepoForUpdates(agentStatus.repoDir);
    if (agentCheck.status === 'failed') {
      await saveAutoUpdateSettings(
        {
          lastRunStatus: 'failed',
          lastRunAt: now.toISOString(),
          lastRunMessage: `Agent check failed: ${agentCheck.message}`,
        },
        target
      );
      return {
        launched: false,
        reason: 'agent-check-failed',
        scheduledDate: decision.scheduledDate,
      };
    }

    if (agentCheck.status !== 'changed') {
      const run = await systemUpdateService.recordSkippedUpdateRun(
        'Agent auto-update skipped: no upstream changes detected',
        'agent',
        'scheduled'
      );
      await saveAutoUpdateSettings(
        {
          lastSkippedDate: decision.scheduledDate,
          lastRunStatus: 'skipped',
          lastRunAt: now.toISOString(),
          lastRunMessage: 'No upstream changes detected',
        },
        target
      );
      return {
        launched: false,
        reason: 'no-updates',
        scheduledDate: decision.scheduledDate,
        runId: run.runId,
      };
    }
  }

  const launched = await systemUpdateService.triggerAgentUpdate({ trigger: 'scheduled' });
  if (!launched.success) {
    await saveAutoUpdateSettings(
      {
        lastRunStatus: 'failed',
        lastRunAt: now.toISOString(),
        lastRunMessage: launched.message,
      },
      target
    );
    return {
      launched: false,
      reason: 'launch-failed',
      scheduledDate: decision.scheduledDate,
    };
  }

  await saveAutoUpdateSettings(
    {
      activeRunId: launched.runId,
      lastScheduledDateLaunched: decision.scheduledDate,
      lastRunStatus: 'running',
      lastRunAt: now.toISOString(),
      lastRunMessage: 'Agent auto-update launched',
    },
    target
  );

  return {
    launched: true,
    runId: launched.runId,
    scheduledDate: decision.scheduledDate,
    kind: decision.kind,
  };
}

function normalizeTime(value: string): string {
  const [hourRaw, minuteRaw] = value.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function timeToMinutes(value: string): number {
  const [hourRaw, minuteRaw] = normalizeTime(value).split(':');
  return Number(hourRaw) * 60 + Number(minuteRaw);
}

function getLocalParts(date: Date, timezone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  const year = map.get('year') ?? '1970';
  const month = map.get('month') ?? '01';
  const day = map.get('day') ?? '01';
  const hour = map.get('hour') ?? '00';
  const minute = map.get('minute') ?? '00';
  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
    minutes: Number(hour) * 60 + Number(minute),
  };
}

function getNextRunAt(settings: AutoUpdateSettings, now: Date): Date {
  const local = getLocalParts(now, settings.timezone);
  const scheduledMinutes = timeToMinutes(settings.time);
  const baseDate = local.minutes < scheduledMinutes ? local.date : addDays(local.date, 1);
  return zonedLocalDateTimeToUtc(baseDate, settings.time, settings.timezone);
}

function addDays(dateText: string, days: number): string {
  const [year, month, day] = dateText.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return date.toISOString().slice(0, 10);
}

function zonedLocalDateTimeToUtc(dateText: string, timeText: string, timezone: string): Date {
  const [year, month, day] = dateText.split('-').map(Number);
  const [hour, minute] = normalizeTime(timeText).split(':').map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const local = getLocalParts(guess, timezone);
  const localDate = new Date(`${local.date}T${local.time}:00.000Z`);
  const desiredDate = new Date(`${dateText}T${normalizeTime(timeText)}:00.000Z`);
  const offset = localDate.getTime() - desiredDate.getTime();
  return new Date(guess.getTime() - offset);
}
