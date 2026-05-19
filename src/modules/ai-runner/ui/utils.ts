import { formatBytes, relativeTime, slugify } from '@/lib/utils';
import cronstrue from 'cronstrue';
import type { DragEvent } from 'react';
import type { AIRunnerLogEntry, AIRunnerRunDTO, AIRunnerScheduleDTO } from '../types';
import { ICON_PRESETS } from './constants';
import type { PromptFormState, ScheduleBuilderMode, ScheduleFormState } from './types';

export { relativeTime as formatRelative, slugify as slugifyValue, formatBytes as formatMemory };

const PROMPT_TEMPLATE_PLACEHOLDER = '<YOUR_PROMPT>';
const DEFAULT_LOG_ENTRY_LIMIT = 500;

export function applyPromptTemplate(template: string, current: string): string {
  if (!current.trim()) return template;
  if (template.includes(PROMPT_TEMPLATE_PLACEHOLDER)) {
    return template.replaceAll(PROMPT_TEMPLATE_PLACEHOLDER, current);
  }
  return `${template.trim()}\n\n${current.trim()}`;
}

export function acceptAttachmentDrag(event: DragEvent<HTMLElement>): void {
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = 'copy';
}

export function getDroppedAttachmentFiles(event: DragEvent<HTMLElement>): FileList {
  acceptAttachmentDrag(event);
  return event.dataTransfer.files;
}

export function emptyPromptForm(): PromptFormState {
  return {
    name: '',
    content: '',
    type: 'inline',
    tags: [],
    attachments: [],
  };
}

export function emptyScheduleForm(
  profileId?: string,
  workingDirectory?: string,
  workspaceId?: string
): ScheduleFormState {
  return {
    name: '',
    promptId: '',
    agentProfileId: profileId ?? '',
    workspaceId,
    workingDirectory: workingDirectory ?? process.env.NEXT_PUBLIC_DEFAULT_WORKDIR ?? '',
    timeout: 30,
    retries: 1,
    cronExpression: '0 9 * * 1-5',
    enabled: true,
  };
}

export function mergeLogEntries(
  current: AIRunnerLogEntry[],
  incoming: AIRunnerLogEntry[],
  limit = DEFAULT_LOG_ENTRY_LIMIT
): AIRunnerLogEntry[] {
  const merged = new Map<string, AIRunnerLogEntry>();
  for (const entry of current) {
    merged.set(entry.id, entry);
  }
  for (const entry of incoming) {
    merged.set(entry.id, entry);
  }

  return Array.from(merged.values())
    .map((entry) => ({
      entry,
      timestamp: Date.parse(entry.timestamp),
    }))
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-limit)
    .map(({ entry }) => entry);
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

export function formatCountdown(targetIso?: string, now = Date.now()): string {
  if (!targetIso) return 'Waiting for enablement';

  const diffMs = new Date(targetIso).getTime() - now;
  if (diffMs === 0) return 'due now';

  let remainingSeconds = Math.floor(Math.abs(diffMs) / 1000);
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

  return diffMs > 0 ? `in ${parts.join(' ')}` : `overdue by ${parts.join(' ')}`;
}

export type ScheduleDashboardState<T extends Pick<AIRunnerScheduleDTO, '_id'>> = {
  enabledScheduleCount: number;
  pausedScheduleCount: number;
  scheduledProfileCount: number;
  recentlyActiveScheduleCount: number;
  nextSchedule: T | undefined;
  sortedSchedules: T[];
};

export interface RunnerInventoryCounts {
  enabledProfileCount: number;
  activeWorkspaceCount: number;
  blockingWorkspaceCount: number;
}

interface RunnerInventoryInput {
  profiles: Array<Pick<{ enabled: boolean }, 'enabled'>>;
  workspaces: Array<Pick<{ enabled: boolean; blocking: boolean }, 'enabled' | 'blocking'>>;
}

export function deriveRunnerInventoryCounts({
  profiles,
  workspaces,
}: RunnerInventoryInput): RunnerInventoryCounts {
  let enabledProfileCount = 0;
  let activeWorkspaceCount = 0;
  let blockingWorkspaceCount = 0;

  for (const profile of profiles) {
    if (profile.enabled) {
      enabledProfileCount += 1;
    }
  }

  for (const workspace of workspaces) {
    if (workspace.enabled) {
      activeWorkspaceCount += 1;
    }
    if (workspace.blocking) {
      blockingWorkspaceCount += 1;
    }
  }

  return {
    enabledProfileCount,
    activeWorkspaceCount,
    blockingWorkspaceCount,
  };
}

type ScheduleDashboardInput = Pick<
  AIRunnerScheduleDTO,
  '_id' | 'agentProfileId' | 'enabled' | 'lastRunAt' | 'nextRunTime' | 'updatedAt'
>;

export function deriveScheduleDashboardState<T extends ScheduleDashboardInput>(
  schedules: T[],
  now = Date.now()
): ScheduleDashboardState<T> {
  let enabledScheduleCount = 0;
  let recentlyActiveScheduleCount = 0;
  let nextSchedule: T | undefined;
  const scheduledProfileIds = new Set<string>();

  for (const schedule of schedules) {
    scheduledProfileIds.add(schedule.agentProfileId);

    if (schedule.enabled) {
      enabledScheduleCount += 1;
    }

    if (schedule.lastRunAt && now - new Date(schedule.lastRunAt).getTime() < 24 * 60 * 60 * 1000) {
      recentlyActiveScheduleCount += 1;
    }

    if (schedule.enabled && schedule.nextRunTime) {
      const nextTime = new Date(schedule.nextRunTime).getTime();
      const currentNextTime = nextSchedule?.nextRunTime
        ? new Date(nextSchedule.nextRunTime).getTime()
        : Number.POSITIVE_INFINITY;
      if (nextTime < currentNextTime) {
        nextSchedule = schedule;
      }
    }
  }

  const sortedSchedules = [...schedules].sort((left, right) => {
    if (left.enabled !== right.enabled) return left.enabled ? -1 : 1;
    if (left.nextRunTime && right.nextRunTime) {
      return new Date(left.nextRunTime).getTime() - new Date(right.nextRunTime).getTime();
    }
    if (left.nextRunTime) return -1;
    if (right.nextRunTime) return 1;
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });

  return {
    enabledScheduleCount,
    pausedScheduleCount: schedules.length - enabledScheduleCount,
    scheduledProfileCount: scheduledProfileIds.size,
    recentlyActiveScheduleCount,
    nextSchedule,
    sortedSchedules,
  };
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

  try {
    return `Custom cron: ${expression} (${cronstrue.toString(expression)})`;
  } catch {
    return `Custom cron: ${expression}`;
  }
}

export interface RunsPerDaySummary {
  runsPerDay: number;
  approximate: boolean;
}

type ScheduleCadenceInput = Pick<AIRunnerScheduleDTO, 'cronExpression' | 'enabled'>;

interface CronFieldEstimate {
  count: number;
  approximate: boolean;
}

function countCronFieldValues(
  field: string,
  min: number,
  max: number,
  normalize?: (value: number) => number
): CronFieldEstimate | null {
  const values = new Set<number>();
  let approximate = false;

  for (const rawToken of field.split(',')) {
    const token = rawToken.trim();
    if (!token) return null;

    const [base, stepRaw] = token.split('/');
    if (stepRaw !== undefined && !isCronNumber(stepRaw, 1, max - min + 1)) return null;
    const step = stepRaw === undefined ? 1 : Number(stepRaw);
    let start = min;
    let end = max;

    if (base === '*') {
      // Keep the full field range.
    } else if (base.includes('-')) {
      const [startRaw, endRaw] = base.split('-');
      if (!isCronNumber(startRaw, min, max) || !isCronNumber(endRaw, min, max)) return null;
      start = Number(startRaw);
      end = Number(endRaw);
      if (start > end) return null;
    } else if (isCronNumber(base, min, max)) {
      start = Number(base);
      end = Number(base);
      if (stepRaw !== undefined) {
        approximate = true;
      }
    } else {
      return null;
    }

    for (let value = start; value <= end; value += step) {
      values.add(normalize ? normalize(value) : value);
    }
  }

  return { count: values.size, approximate };
}

function getAdvancedCronRunsPerDay(expression: string): RunsPerDaySummary | null {
  const [minute = '*', hour = '*', dayOfMonth = '*', month = '*', dayOfWeek = '*', extra] =
    expression.trim().split(/\s+/);

  if (extra) return null;

  const minuteEstimate = countCronFieldValues(minute, 0, 59);
  const hourEstimate = countCronFieldValues(hour, 0, 23);
  const dayOfMonthEstimate = countCronFieldValues(dayOfMonth, 1, 31);
  const monthEstimate = countCronFieldValues(month, 1, 12);
  const dayOfWeekEstimate = countCronFieldValues(dayOfWeek, 0, 7, (value) => value % 7);

  if (
    !minuteEstimate ||
    !hourEstimate ||
    !dayOfMonthEstimate ||
    !monthEstimate ||
    !dayOfWeekEstimate
  ) {
    return null;
  }

  const dayOfMonthRestricted = dayOfMonth !== '*';
  const dayOfWeekRestricted = dayOfWeek !== '*';
  const monthRestricted = month !== '*';
  const dayOfMonthRatio = dayOfMonthRestricted ? dayOfMonthEstimate.count / 31 : 1;
  const dayOfWeekRatio = dayOfWeekRestricted ? dayOfWeekEstimate.count / 7 : 1;
  const activeDayRatio =
    dayOfMonthRestricted && dayOfWeekRestricted
      ? 1 - (1 - dayOfMonthRatio) * (1 - dayOfWeekRatio)
      : Math.min(dayOfMonthRatio, dayOfWeekRatio);
  const monthRatio = monthRestricted ? monthEstimate.count / 12 : 1;

  return {
    runsPerDay: minuteEstimate.count * hourEstimate.count * activeDayRatio * monthRatio,
    approximate:
      dayOfMonthRestricted ||
      dayOfWeekRestricted ||
      monthRestricted ||
      minuteEstimate.approximate ||
      hourEstimate.approximate ||
      dayOfMonthEstimate.approximate ||
      monthEstimate.approximate ||
      dayOfWeekEstimate.approximate,
  };
}

function estimateCronRunsPerDay(expression: string): RunsPerDaySummary | null {
  const parsed = parseScheduleBuilder(expression);

  if (parsed.mode === 'every') {
    return { runsPerDay: 1440 / parsed.interval, approximate: false };
  }
  if (parsed.mode === 'hourly') {
    return { runsPerDay: 24, approximate: false };
  }
  if (parsed.mode === 'daily') {
    return { runsPerDay: 1, approximate: false };
  }
  if (parsed.mode === 'weekly') {
    return {
      runsPerDay: parsed.days.length / 7,
      approximate: parsed.days.length !== 7,
    };
  }
  if (parsed.mode === 'monthly') {
    return { runsPerDay: 12 / 365.2425, approximate: true };
  }

  return getAdvancedCronRunsPerDay(expression);
}

export function summarizeRunsPerDay(schedules: ScheduleCadenceInput[]): RunsPerDaySummary | null {
  let runsPerDay = 0;
  let approximate = false;
  let estimatedSchedules = 0;

  for (const schedule of schedules) {
    if (!schedule.enabled) continue;
    const estimate = estimateCronRunsPerDay(schedule.cronExpression);
    if (!estimate) {
      approximate = true;
      continue;
    }
    runsPerDay += estimate.runsPerDay;
    approximate = approximate || estimate.approximate;
    estimatedSchedules += 1;
  }

  if (estimatedSchedules === 0) return null;
  return { runsPerDay, approximate };
}

export function formatRunsPerDayLabel(summary: RunsPerDaySummary | null): string | null {
  if (!summary) return null;

  const rounded =
    summary.runsPerDay >= 1
      ? Math.round(summary.runsPerDay * 10) / 10
      : Math.round(summary.runsPerDay * 100) / 100;
  const value = Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toString();
  return `${summary.approximate ? '≈' : ''}${value} runs/day`;
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

export function formatDateTime(
  iso?: string,
  options?: {
    includeSeconds?: boolean;
  }
): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: options?.includeSeconds ? '2-digit' : undefined,
  });
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
