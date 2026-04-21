import type { AIRunnerRunDTO, AIRunnerScheduleDTO } from '../types';
import { ICON_PRESETS } from './constants';
import type { PromptFormState, ScheduleBuilderMode, ScheduleFormState } from './types';

export function emptyPromptForm(): PromptFormState {
  return {
    name: '',
    content: '',
    type: 'inline',
    tags: [],
  };
}

export function emptyScheduleForm(
  profileId?: string,
  workingDirectory?: string
): ScheduleFormState {
  return {
    name: '',
    promptId: '',
    agentProfileId: profileId ?? '',
    workingDirectory: workingDirectory ?? process.env.NEXT_PUBLIC_DEFAULT_WORKDIR ?? '',
    timeout: 30,
    cronExpression: '0 9 * * 1-5',
    enabled: true,
  };
}

export function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '—';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes === 0) return `${remainder}s`;
  if (minutes < 60) return `${minutes}m ${remainder}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function formatRelative(iso?: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.round(diff / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function formatCountdown(targetIso?: string, now = Date.now()): string {
  if (!targetIso) return 'Waiting for enablement';

  const diffMs = new Date(targetIso).getTime() - now;
  if (diffMs <= 0) return 'due now';

  let remainingSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(remainingSeconds / 86_400);
  remainingSeconds -= days * 86_400;
  const hours = Math.floor(remainingSeconds / 3_600);
  remainingSeconds -= hours * 3_600;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds - minutes * 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return `in ${parts.join(' ')}`;
}

const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => index);
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => index);
const WEEKDAY_OPTIONS = [
  { label: 'Sun', value: 0 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
] as const;

export function getMinuteOptions() {
  return MINUTE_OPTIONS;
}

export function getHourOptions() {
  return HOUR_OPTIONS;
}

export function getWeekdayOptions() {
  return WEEKDAY_OPTIONS;
}

export function padCronNumber(value: number): string {
  return value.toString().padStart(2, '0');
}

function isCronNumber(value: string, min: number, max: number): boolean {
  if (!/^\d+$/.test(value)) return false;
  const numeric = Number(value);
  return numeric >= min && numeric <= max;
}

function parseDayOfWeekField(field: string): number[] | null {
  if (!field || field === '*') return null;

  const result = new Set<number>();
  for (const token of field.split(',')) {
    const trimmed = token.trim();
    if (!trimmed) continue;

    if (trimmed.includes('-')) {
      const [startRaw, endRaw] = trimmed.split('-');
      if (!isCronNumber(startRaw, 0, 7) || !isCronNumber(endRaw, 0, 7)) return null;
      const start = Number(startRaw) % 7;
      const end = Number(endRaw) % 7;
      if (start > end) return null;
      for (let value = start; value <= end; value += 1) {
        result.add(value);
      }
      continue;
    }

    if (!isCronNumber(trimmed, 0, 7)) return null;
    result.add(Number(trimmed) % 7);
  }

  return Array.from(result).sort((left, right) => left - right);
}

export function formatDayOfWeekField(values: number[]): string {
  if (values.length === 0 || values.length === 7) return '*';

  const sorted = Array.from(new Set(values)).sort((left, right) => left - right);
  const ranges: string[] = [];
  let rangeStart = sorted[0];
  let previous = sorted[0];

  for (let index = 1; index <= sorted.length; index += 1) {
    const value = sorted[index];
    if (value === previous + 1) {
      previous = value;
      continue;
    }

    ranges.push(rangeStart === previous ? `${rangeStart}` : `${rangeStart}-${previous}`);
    rangeStart = value;
    previous = value;
  }

  return ranges.join(',');
}

export function formatTimeLabel(hour: number, minute: number): string {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function describeWeekdays(days: number[]): string {
  const sorted = Array.from(new Set(days)).sort((left, right) => left - right);
  if (sorted.length === 0 || sorted.length === 7) return 'Every day';
  if (sorted.join(',') === '1,2,3,4,5') return 'Weekdays';
  if (sorted.join(',') === '0,6') return 'Weekends';
  return sorted
    .map((value) => WEEKDAY_OPTIONS.find((option) => option.value === value)?.label ?? `${value}`)
    .join(', ');
}

export function parseScheduleBuilder(
  expression: string
):
  | { mode: 'every'; interval: number }
  | { mode: 'hourly'; minute: number }
  | { mode: 'daily'; hour: number; minute: number }
  | { mode: 'weekly'; hour: number; minute: number; days: number[] }
  | { mode: 'monthly'; dayOfMonth: number; hour: number; minute: number }
  | { mode: 'advanced' } {
  const [minute = '*', hour = '*', dayOfMonth = '*', month = '*', dayOfWeek = '*', extra] =
    expression.trim().split(/\s+/);

  if (extra) return { mode: 'advanced' };

  if (hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    if (minute === '*') {
      return { mode: 'every', interval: 1 };
    }
    if (/^\*\/\d+$/.test(minute)) {
      const interval = Number(minute.slice(2));
      if (interval >= 1 && interval <= 59) {
        return { mode: 'every', interval };
      }
    }
    if (isCronNumber(minute, 0, 59)) {
      return { mode: 'hourly', minute: Number(minute) };
    }
  }

  if (
    isCronNumber(minute, 0, 59) &&
    isCronNumber(hour, 0, 23) &&
    dayOfMonth === '*' &&
    month === '*' &&
    dayOfWeek === '*'
  ) {
    return { mode: 'daily', hour: Number(hour), minute: Number(minute) };
  }

  const days = parseDayOfWeekField(dayOfWeek);
  if (
    isCronNumber(minute, 0, 59) &&
    isCronNumber(hour, 0, 23) &&
    dayOfMonth === '*' &&
    month === '*' &&
    days
  ) {
    return { mode: 'weekly', hour: Number(hour), minute: Number(minute), days };
  }

  if (
    isCronNumber(minute, 0, 59) &&
    isCronNumber(hour, 0, 23) &&
    isCronNumber(dayOfMonth, 1, 31) &&
    month === '*' &&
    dayOfWeek === '*'
  ) {
    return {
      mode: 'monthly',
      dayOfMonth: Number(dayOfMonth),
      hour: Number(hour),
      minute: Number(minute),
    };
  }

  return { mode: 'advanced' };
}

export function humanizeCron(expression: string): string {
  const parsed = parseScheduleBuilder(expression);

  if (parsed.mode === 'every') {
    return parsed.interval === 1 ? 'Every minute' : `Every ${parsed.interval} minutes`;
  }
  if (parsed.mode === 'hourly') {
    return `Every hour at :${padCronNumber(parsed.minute)}`;
  }
  if (parsed.mode === 'daily') {
    return `Daily at ${formatTimeLabel(parsed.hour, parsed.minute)}`;
  }
  if (parsed.mode === 'weekly') {
    return `${describeWeekdays(parsed.days)} at ${formatTimeLabel(parsed.hour, parsed.minute)}`;
  }
  if (parsed.mode === 'monthly') {
    return `Monthly on day ${parsed.dayOfMonth} at ${formatTimeLabel(parsed.hour, parsed.minute)}`;
  }

  return `Custom cron: ${expression}`;
}

export function getScheduleModeLabel(expression: string): string {
  const parsed = parseScheduleBuilder(expression);
  if (parsed.mode === 'every') return 'Interval';
  if (parsed.mode === 'hourly') return 'Hourly';
  if (parsed.mode === 'daily') return 'Daily';
  if (parsed.mode === 'weekly') return 'Weekly';
  if (parsed.mode === 'monthly') return 'Monthly';
  return 'Advanced';
}

export function getScheduleStatusVariant(
  status?: AIRunnerScheduleDTO['lastRunStatus']
): 'success' | 'warning' | 'destructive' | 'outline' {
  if (status === 'completed') return 'success';
  if (status === 'failed' || status === 'timeout' || status === 'killed') return 'destructive';
  if (status === 'running' || status === 'queued' || status === 'retrying') return 'warning';
  return 'outline';
}

export function getRunStatusVariant(
  status?: AIRunnerRunDTO['status']
): 'success' | 'warning' | 'destructive' | 'default' | 'outline' {
  if (status === 'completed') return 'success';
  if (status === 'running') return 'default';
  if (status === 'failed' || status === 'timeout' || status === 'killed') return 'destructive';
  if (status === 'queued' || status === 'retrying') return 'warning';
  return 'outline';
}

export function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatMemory(bytes?: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

export function formatScheduleDate(iso?: string): string {
  if (!iso) return 'Not scheduled';
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function slugifyValue(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

export function getPresetIcon(icon?: string) {
  return ICON_PRESETS.find((entry) => entry.key === icon);
}

export function isUploadedIcon(icon?: string): boolean {
  return Boolean(icon?.startsWith('data:image/'));
}

export function getDefaultCronExpressionForMode(mode: ScheduleBuilderMode): string | null {
  if (mode === 'advanced') return null;
  if (mode === 'every') return '*/15 * * * *';
  if (mode === 'hourly') return '0 * * * *';
  if (mode === 'daily') return '0 9 * * *';
  if (mode === 'weekly') return '0 9 * * 1-5';
  return '0 9 1 * *';
}
