'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  Bot,
  CalendarClock,
  Clock3,
  FolderOpen,
  History,
  Info,
  Play,
  RefreshCcw,
  Save,
  Search,
  Settings2,
  Sparkles,
  Square,
  TerminalSquare,
  Trash2,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageSkeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import type {
  AIRunnerProfileDTO,
  AIRunnerPromptDTO,
  AIRunnerRunDTO,
  AIRunnerRunsResponse,
  AIRunnerScheduleDTO,
} from '../types';

type ViewTab = 'run' | 'prompts' | 'schedules' | 'history' | 'settings';
type ProfileFormState = Omit<AIRunnerProfileDTO, '_id' | 'createdAt' | 'updatedAt'>;
type PromptFormState = Omit<AIRunnerPromptDTO, '_id' | 'createdAt' | 'updatedAt'>;
type RunFormState = {
  name: string;
  content: string;
  type: 'inline' | 'file-reference' | 'saved-prompt';
  promptId?: string;
  agentProfileId: string;
  workingDirectory: string;
  timeout: number;
};
type ScheduleFormState = Omit<
  AIRunnerScheduleDTO,
  '_id' | 'createdAt' | 'updatedAt' | 'lastRunId' | 'lastRunStatus' | 'lastRunAt' | 'nextRunTime'
>;
type IconPresetKey =
  | 'bot'
  | 'zap'
  | 'terminal'
  | 'calendar'
  | 'history'
  | 'folder'
  | 'settings'
  | 'sparkles';

const TAB_META: Array<{ id: ViewTab; label: string; icon: React.ReactNode }> = [
  { id: 'run', label: 'Run', icon: <Play className="w-4 h-4" /> },
  { id: 'prompts', label: 'Saved Prompts', icon: <Save className="w-4 h-4" /> },
  { id: 'schedules', label: 'Schedules', icon: <CalendarClock className="w-4 h-4" /> },
  { id: 'history', label: 'History', icon: <History className="w-4 h-4" /> },
  { id: 'settings', label: 'Agent Profiles', icon: <Settings2 className="w-4 h-4" /> },
];

const DEFAULT_PROFILE_FORM: ProfileFormState = {
  name: '',
  slug: '',
  agentType: 'codex',
  invocationTemplate: 'codex --dangerously-bypass-approvals-and-sandbox "$PROMPT"',
  defaultTimeout: 30,
  maxTimeout: 120,
  shell: '/bin/bash',
  env: {},
  enabled: true,
  icon: '',
};

const ICON_PRESETS: Array<{
  key: IconPresetKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: 'bot', label: 'Bot', icon: Bot },
  { key: 'zap', label: 'Zap', icon: Zap },
  { key: 'terminal', label: 'Terminal', icon: TerminalSquare },
  { key: 'calendar', label: 'Calendar', icon: CalendarClock },
  { key: 'history', label: 'History', icon: History },
  { key: 'folder', label: 'Folder', icon: FolderOpen },
  { key: 'settings', label: 'Settings', icon: Settings2 },
  { key: 'sparkles', label: 'Sparkles', icon: Sparkles },
];

function emptyPromptForm(): PromptFormState {
  return {
    name: '',
    content: '',
    type: 'inline',
    tags: [],
  };
}

function emptyScheduleForm(profileId?: string, workingDirectory?: string): ScheduleFormState {
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

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatRelative(iso?: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.round(diff / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

type ScheduleBuilderMode = 'every' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'advanced';

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

function padCronNumber(value: number): string {
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

function formatDayOfWeekField(values: number[]): string {
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

function formatTimeLabel(hour: number, minute: number): string {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function describeWeekdays(days: number[]): string {
  const sorted = Array.from(new Set(days)).sort((left, right) => left - right);
  if (sorted.length === 0 || sorted.length === 7) return 'Every day';
  if (sorted.join(',') === '1,2,3,4,5') return 'Weekdays';
  if (sorted.join(',') === '0,6') return 'Weekends';
  return sorted
    .map((value) => WEEKDAY_OPTIONS.find((option) => option.value === value)?.label ?? `${value}`)
    .join(', ');
}

function parseScheduleBuilder(
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

function humanizeCron(expression: string): string {
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

function getScheduleModeLabel(expression: string): string {
  const parsed = parseScheduleBuilder(expression);
  if (parsed.mode === 'every') return 'Interval';
  if (parsed.mode === 'hourly') return 'Hourly';
  if (parsed.mode === 'daily') return 'Daily';
  if (parsed.mode === 'weekly') return 'Weekly';
  if (parsed.mode === 'monthly') return 'Monthly';
  return 'Advanced';
}

function getScheduleStatusVariant(
  status?: AIRunnerScheduleDTO['lastRunStatus']
): 'success' | 'warning' | 'destructive' | 'outline' {
  if (status === 'completed') return 'success';
  if (status === 'failed' || status === 'timeout' || status === 'killed') return 'destructive';
  if (status === 'running' || status === 'queued') return 'warning';
  return 'outline';
}

function formatScheduleDate(iso?: string): string {
  if (!iso) return 'Not scheduled';
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function slugifyValue(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function getPresetIcon(icon?: string) {
  return ICON_PRESETS.find((entry) => entry.key === icon);
}

function isUploadedIcon(icon?: string): boolean {
  return Boolean(icon?.startsWith('data:image/'));
}

function FieldHint({ text }: { text: string }) {
  return (
    <span
      title={text}
      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground cursor-help"
    >
      <Info className="h-3.5 w-3.5" />
    </span>
  );
}

function LabelWithHint({ label, hint }: { label: string; hint?: string }) {
  return (
    <span className="flex items-center gap-1.5 text-sm font-medium">
      {label}
      {hint ? <FieldHint text={hint} /> : null}
    </span>
  );
}

function ProfileIconPreview({
  icon,
  name,
  className,
}: {
  icon?: string;
  name: string;
  className?: string;
}) {
  const preset = getPresetIcon(icon);

  if (isUploadedIcon(icon)) {
    return (
      <div
        className={cn(
          'relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-border bg-card',
          className
        )}
      >
        <Image src={icon!} alt={`${name} icon`} fill sizes="40px" className="object-cover" />
      </div>
    );
  }

  const Icon = preset?.icon ?? Bot;
  return (
    <div
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-secondary text-primary',
        className
      )}
    >
      <Icon className="h-5 w-5" />
    </div>
  );
}

function ScheduleBuilder({
  cronExpression,
  onChange,
}: {
  cronExpression: string;
  onChange: (value: string) => void;
}) {
  const parsed = parseScheduleBuilder(cronExpression);
  const [modeState, setModeState] = useState<{
    expression: string;
    mode: ScheduleBuilderMode;
  }>({
    expression: cronExpression,
    mode: parsed.mode,
  });
  const mode = modeState.expression === cronExpression ? modeState.mode : parsed.mode;

  const minute =
    parsed.mode === 'every'
      ? parsed.interval === 1
        ? 0
        : parsed.interval
      : parsed.mode === 'hourly' || parsed.mode === 'daily' || parsed.mode === 'weekly'
        ? parsed.minute
        : parsed.mode === 'monthly'
          ? parsed.minute
          : 0;
  const hour =
    parsed.mode === 'daily' || parsed.mode === 'weekly' || parsed.mode === 'monthly'
      ? parsed.hour
      : 9;
  const weeklyDays = parsed.mode === 'weekly' ? parsed.days : [1, 2, 3, 4, 5];
  const monthlyDay = parsed.mode === 'monthly' ? parsed.dayOfMonth : 1;
  const modeLabel = getScheduleModeLabel(cronExpression);
  const timeLabel =
    parsed.mode === 'daily' || parsed.mode === 'weekly' || parsed.mode === 'monthly'
      ? formatTimeLabel(parsed.hour, parsed.minute)
      : parsed.mode === 'hourly'
        ? `:${padCronNumber(parsed.minute)} each hour`
        : parsed.mode === 'every'
          ? parsed.interval === 1
            ? 'Every minute'
            : `Every ${parsed.interval} minutes`
          : 'Custom cadence';
  const patternLabel =
    parsed.mode === 'weekly'
      ? describeWeekdays(parsed.days)
      : parsed.mode === 'monthly'
        ? `Day ${parsed.dayOfMonth} of the month`
        : parsed.mode === 'daily'
          ? 'Every day'
          : parsed.mode === 'hourly'
            ? 'Hourly pulse'
            : parsed.mode === 'every'
              ? 'Interval loop'
              : 'Manual cron control';

  const updateExpression = (nextExpression: string, nextMode = mode) => {
    setModeState({ expression: nextExpression, mode: nextMode });
    onChange(nextExpression);
  };

  const setModeAndExpression = (nextMode: ScheduleBuilderMode) => {
    if (nextMode === 'advanced') {
      setModeState({ expression: cronExpression, mode: nextMode });
      return;
    }
    if (nextMode === 'every') {
      updateExpression('*/15 * * * *', nextMode);
      return;
    }
    if (nextMode === 'hourly') {
      updateExpression('0 * * * *', nextMode);
      return;
    }
    if (nextMode === 'daily') {
      updateExpression('0 9 * * *', nextMode);
      return;
    }
    if (nextMode === 'weekly') {
      updateExpression('0 9 * * 1-5', nextMode);
      return;
    }
    if (nextMode === 'monthly') {
      updateExpression('0 9 1 * *', nextMode);
      return;
    }
  };

  const updateTimeBasedExpression = (nextHour: number, nextMinute: number) => {
    if (mode === 'hourly') {
      updateExpression(`${nextMinute} * * * *`);
      return;
    }
    if (mode === 'daily') {
      updateExpression(`${nextMinute} ${nextHour} * * *`);
      return;
    }
    if (mode === 'weekly') {
      updateExpression(`${nextMinute} ${nextHour} * * ${formatDayOfWeekField(weeklyDays)}`);
      return;
    }
    if (mode === 'monthly') {
      updateExpression(`${nextMinute} ${nextHour} ${monthlyDay} * *`);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-warning/10 p-5 shadow-[0_24px_90px_-55px_rgba(99,102,241,0.55)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_55%)]" />
      <div className="pointer-events-none absolute right-0 top-8 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-8 h-28 w-28 rounded-full bg-warning/10 blur-3xl" />
      <div className="relative space-y-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary/80">
              Cadence Studio
            </p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight">
              Design exactly when this automation wakes up
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Build a rhythm that feels intentional: quick pulse loops, polished daily launches,
              weekly workday routines, or fully custom cron logic when you want total control.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[360px] xl:grid-cols-1">
            <div className="rounded-2xl border border-primary/20 bg-background/80 px-4 py-3 backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Cadence
              </p>
              <p className="mt-1 text-sm font-semibold">{modeLabel}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/80 px-4 py-3 backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Launch Window
              </p>
              <p className="mt-1 text-sm font-semibold">{timeLabel}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/80 px-4 py-3 backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Pattern
              </p>
              <p className="mt-1 text-sm font-semibold">{patternLabel}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[
            {
              id: 'every' as const,
              label: 'Every X Minutes',
              description: 'Fast recurring checks like queue sweeps or watch loops.',
            },
            {
              id: 'hourly' as const,
              label: 'Hourly',
              description: 'Run at the same minute every hour.',
            },
            {
              id: 'daily' as const,
              label: 'Daily',
              description: 'One clean daily run at a specific time.',
            },
            {
              id: 'weekly' as const,
              label: 'Weekly',
              description: 'Pick specific weekdays and a run time.',
            },
            {
              id: 'monthly' as const,
              label: 'Monthly',
              description: 'Run on a specific day of the month.',
            },
            {
              id: 'advanced' as const,
              label: 'Advanced Cron',
              description: 'Edit the raw 5-field cron expression directly.',
            },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setModeAndExpression(option.id)}
              className={cn(
                'rounded-[24px] border px-4 py-4 text-left transition-all duration-200',
                mode === option.id
                  ? 'border-primary/40 bg-background/90 shadow-[0_20px_45px_-28px_rgba(99,102,241,0.55)]'
                  : 'border-border/60 bg-background/75 hover:border-primary/20 hover:bg-background'
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">{option.label}</p>
                <span
                  className={cn(
                    'h-2.5 w-2.5 rounded-full',
                    mode === option.id
                      ? 'bg-primary shadow-[0_0_0_6px_rgba(99,102,241,0.15)]'
                      : 'bg-border'
                  )}
                />
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{option.description}</p>
            </button>
          ))}
        </div>

        {mode === 'every' && (
          <div className="rounded-[24px] border border-border/60 bg-background/80 p-5 backdrop-blur">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">Run every</span>
              <input
                type="number"
                min={1}
                max={59}
                value={parsed.mode === 'every' ? parsed.interval : 15}
                onChange={(event) => {
                  const interval = Math.min(Math.max(Number(event.target.value) || 1, 1), 59);
                  updateExpression(interval === 1 ? '* * * * *' : `*/${interval} * * * *`);
                }}
                className="h-10 w-24 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              />
              <span className="text-sm text-muted-foreground">minutes</span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Great for watchdogs, tiny cleanup jobs, or any agent you want pulsing throughout the
              day.
            </p>
          </div>
        )}

        {mode === 'hourly' && (
          <div className="rounded-[24px] border border-border/60 bg-background/80 p-5 backdrop-blur">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">Run every hour at</span>
              <select
                value={parsed.mode === 'hourly' ? parsed.minute : 0}
                onChange={(event) => updateTimeBasedExpression(hour, Number(event.target.value))}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              >
                {MINUTE_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    :{padCronNumber(value)}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Use hourly launches for recurring review passes or regular health sweeps on a stable
              minute mark.
            </p>
          </div>
        )}

        {(mode === 'daily' || mode === 'weekly' || mode === 'monthly') && (
          <div className="rounded-[24px] border border-border/60 bg-background/80 p-5 space-y-4 backdrop-blur">
            {mode === 'weekly' && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Run on</p>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_OPTIONS.map((option) => {
                    const selected = weeklyDays.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          const nextDays = selected
                            ? weeklyDays.filter((value) => value !== option.value)
                            : [...weeklyDays, option.value];
                          const safeDays = nextDays.length > 0 ? nextDays : [1];
                          updateExpression(
                            `${minute} ${hour} * * ${formatDayOfWeekField(safeDays)}`
                          );
                        }}
                        className={cn(
                          'rounded-full border px-3 py-2 text-sm transition-colors',
                          selected
                            ? 'border-primary/40 bg-primary/5 text-foreground'
                            : 'border-border/60 bg-background text-muted-foreground hover:bg-accent/30'
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Choose the days this automation should appear on your calendar.
                </p>
              </div>
            )}

            {mode === 'monthly' && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium">Day of month</span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={monthlyDay}
                  onChange={(event) => {
                    const nextDay = Math.min(Math.max(Number(event.target.value) || 1, 1), 31);
                    updateExpression(`${minute} ${hour} ${nextDay} * *`);
                  }}
                  className="h-10 w-24 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="block text-sm font-medium">Hour</span>
                <select
                  value={hour}
                  onChange={(event) =>
                    updateTimeBasedExpression(Number(event.target.value), minute)
                  }
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                >
                  {HOUR_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {padCronNumber(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="block text-sm font-medium">Minute</span>
                <select
                  value={minute}
                  onChange={(event) => updateTimeBasedExpression(hour, Number(event.target.value))}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                >
                  {MINUTE_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {padCronNumber(value)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}

        {mode === 'advanced' && (
          <div className="rounded-[24px] border border-border/60 bg-background/80 p-5 space-y-3 backdrop-blur">
            <label className="space-y-1.5">
              <span className="block text-sm font-medium">Cron Expression</span>
              <input
                value={cronExpression}
                onChange={(event) => updateExpression(event.target.value, 'advanced')}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-mono outline-none focus:ring-2 focus:ring-ring/40"
                placeholder="0 9 * * 1-5"
              />
            </label>
            <div className="grid grid-cols-5 gap-2 text-[11px] text-muted-foreground">
              {['Minute', 'Hour', 'Day', 'Month', 'Weekday'].map((label) => (
                <div
                  key={label}
                  className="rounded-lg border border-border/50 bg-background px-2 py-2 text-center"
                >
                  {label}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Advanced mode stays raw on purpose. If you paste a custom cron, the preview still
              helps you keep your bearings.
            </p>
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[24px] border border-primary/20 bg-background/85 px-4 py-4 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Narrative</p>
            <p className="mt-2 text-base font-semibold tracking-tight">
              {humanizeCron(cronExpression)}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              This is the human version of the cadence your cron string currently describes.
            </p>
          </div>
          <div className="rounded-[24px] border border-border/60 bg-slate-950/95 px-4 py-4 text-slate-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Raw Cron</p>
              <Badge variant="outline" className="border-slate-700 text-slate-300">
                5 fields
              </Badge>
            </div>
            <p className="mt-3 font-mono text-sm">{cronExpression}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent?: string;
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
          </div>
          <div className={cn('rounded-lg bg-secondary p-2', accent)}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AIRunnerPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ViewTab>('run');
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<AIRunnerProfileDTO[]>([]);
  const [prompts, setPrompts] = useState<AIRunnerPromptDTO[]>([]);
  const [schedules, setSchedules] = useState<AIRunnerScheduleDTO[]>([]);
  const [runs, setRuns] = useState<AIRunnerRunDTO[]>([]);
  const [runTotal, setRunTotal] = useState(0);
  const [directories, setDirectories] = useState<string[]>([]);
  const [selectedRun, setSelectedRun] = useState<AIRunnerRunDTO | null>(null);
  const [runSearch, setRunSearch] = useState('');
  const [promptSearch, setPromptSearch] = useState('');
  const [promptTypeFilter, setPromptTypeFilter] = useState<'all' | AIRunnerPromptDTO['type']>(
    'all'
  );
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [runPending, setRunPending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileFormState>(DEFAULT_PROFILE_FORM);
  const [promptForm, setPromptForm] = useState<PromptFormState>(emptyPromptForm());
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(emptyScheduleForm());
  const [runForm, setRunForm] = useState<RunFormState>({
    name: '',
    content: '',
    type: 'inline',
    agentProfileId: '',
    workingDirectory: '',
    timeout: 30,
  });

  const loadAll = useCallback(
    async (search = runSearch) => {
      const firstLoad = loading;
      if (!firstLoad) {
        setRefreshing(true);
      }

      try {
        const [profilesRes, promptsRes, schedulesRes, runsRes, directoriesRes] = await Promise.all([
          fetch('/api/modules/ai-runner/profiles', { cache: 'no-store' }),
          fetch('/api/modules/ai-runner/prompts', { cache: 'no-store' }),
          fetch('/api/modules/ai-runner/schedules', { cache: 'no-store' }),
          fetch(
            `/api/modules/ai-runner/runs?limit=25${search ? `&search=${encodeURIComponent(search)}` : ''}`,
            { cache: 'no-store' }
          ),
          fetch('/api/modules/ai-runner/directories', { cache: 'no-store' }),
        ]);

        if (profilesRes.ok) {
          const profilePayload: AIRunnerProfileDTO[] = await profilesRes.json();
          setProfiles(profilePayload);
          if (!runForm.agentProfileId && profilePayload[0]) {
            setRunForm((current) => ({
              ...current,
              agentProfileId: profilePayload[0]._id,
              timeout: profilePayload[0].defaultTimeout,
            }));
            setScheduleForm((current) => ({
              ...current,
              agentProfileId: current.agentProfileId || profilePayload[0]._id,
              timeout: current.agentProfileId ? current.timeout : profilePayload[0].defaultTimeout,
            }));
          }
        }

        if (promptsRes.ok) {
          setPrompts(await promptsRes.json());
        }

        if (schedulesRes.ok) {
          setSchedules(await schedulesRes.json());
        }

        if (runsRes.ok) {
          const payload: AIRunnerRunsResponse = await runsRes.json();
          setRuns(payload.runs);
          setRunTotal(payload.total);
        }

        if (directoriesRes.ok) {
          const payload = await directoriesRes.json();
          setDirectories(payload.directories ?? []);
          setRunForm((current) => ({
            ...current,
            workingDirectory: current.workingDirectory || payload.directories?.[0] || '',
          }));
          setScheduleForm((current) => ({
            ...current,
            workingDirectory: current.workingDirectory || payload.directories?.[0] || '',
          }));
        }
      } catch (error) {
        toast({
          title: 'Load failed',
          description: error instanceof Error ? error.message : 'Failed to load AI Runner data',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loading, runForm.agentProfileId, runSearch, toast]
  );

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!selectedRun || selectedRun.status !== 'running') {
      return;
    }

    const interval = window.setInterval(async () => {
      const response = await fetch(`/api/modules/ai-runner/runs/${selectedRun._id}`, {
        cache: 'no-store',
      });
      if (!response.ok) return;
      const run: AIRunnerRunDTO = await response.json();
      setSelectedRun(run);
      setRuns((current) => current.map((item) => (item._id === run._id ? run : item)));
    }, 2000);

    return () => window.clearInterval(interval);
  }, [selectedRun]);

  const profileMap = useMemo(
    () => Object.fromEntries(profiles.map((profile) => [profile._id, profile])),
    [profiles]
  );

  const promptMap = useMemo(
    () => Object.fromEntries(prompts.map((prompt) => [prompt._id, prompt])),
    [prompts]
  );
  const filteredPrompts = useMemo(() => {
    return prompts.filter((prompt) => {
      const matchesType = promptTypeFilter === 'all' || prompt.type === promptTypeFilter;
      const query = promptSearch.trim().toLowerCase();
      const matchesSearch =
        query.length === 0 ||
        prompt.name.toLowerCase().includes(query) ||
        prompt.content.toLowerCase().includes(query) ||
        prompt.tags.some((tag) => tag.toLowerCase().includes(query));
      return matchesType && matchesSearch;
    });
  }, [promptSearch, promptTypeFilter, prompts]);
  const selectedPrompt =
    filteredPrompts.find((prompt) => prompt._id === selectedPromptId) ??
    prompts.find((prompt) => prompt._id === selectedPromptId) ??
    filteredPrompts[0] ??
    prompts[0] ??
    null;
  const selectedRunPrompt = prompts.find((prompt) => prompt._id === runForm.promptId) ?? null;

  const activeRunCount = runs.filter((run) => run.status === 'running').length;
  const enabledScheduleCount = schedules.filter((schedule) => schedule.enabled).length;
  const successfulRuns = runs.filter((run) => run.status === 'completed').length;
  const pausedScheduleCount = schedules.length - enabledScheduleCount;
  const recentlyActiveScheduleCount = schedules.filter((schedule) => {
    if (!schedule.lastRunAt) return false;
    return Date.now() - new Date(schedule.lastRunAt).getTime() < 24 * 60 * 60 * 1000;
  }).length;
  const scheduleModeCount = new Set(
    schedules.map((schedule) => getScheduleModeLabel(schedule.cronExpression))
  ).size;
  const nextSchedule = schedules
    .filter((schedule) => schedule.enabled && schedule.nextRunTime)
    .sort((a, b) => new Date(a.nextRunTime!).getTime() - new Date(b.nextRunTime!).getTime())[0];
  const sortedSchedules = [...schedules].sort((left, right) => {
    if (left.enabled !== right.enabled) return left.enabled ? -1 : 1;
    if (left.nextRunTime && right.nextRunTime) {
      return new Date(left.nextRunTime).getTime() - new Date(right.nextRunTime).getTime();
    }
    if (left.nextRunTime) return -1;
    if (right.nextRunTime) return 1;
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
  const scheduleFormPromptName = scheduleForm.promptId
    ? promptMap[scheduleForm.promptId]?.name || 'Unknown prompt'
    : 'Choose a saved prompt';
  const scheduleFormProfileName = scheduleForm.agentProfileId
    ? profileMap[scheduleForm.agentProfileId]?.name || 'Unknown profile'
    : 'Choose an agent profile';

  const profileAgentType = profileMap[runForm.agentProfileId]?.agentType;

  const selectProfileForEdit = (profile: AIRunnerProfileDTO) => {
    setEditingProfileId(profile._id);
    setProfileForm({
      name: profile.name,
      slug: profile.slug,
      agentType: profile.agentType,
      invocationTemplate: profile.invocationTemplate,
      defaultTimeout: profile.defaultTimeout,
      maxTimeout: profile.maxTimeout,
      shell: profile.shell,
      env: profile.env,
      enabled: profile.enabled,
      icon: profile.icon ?? '',
    });
    setActiveTab('settings');
  };

  const selectPromptForEdit = (prompt: AIRunnerPromptDTO) => {
    setSelectedPromptId(prompt._id);
    setEditingPromptId(prompt._id);
    setPromptForm({
      name: prompt.name,
      content: prompt.content,
      type: prompt.type,
      tags: prompt.tags,
    });
    setActiveTab('prompts');
  };

  const selectScheduleForEdit = (schedule: AIRunnerScheduleDTO) => {
    setEditingScheduleId(schedule._id);
    setScheduleForm({
      name: schedule.name,
      promptId: schedule.promptId,
      agentProfileId: schedule.agentProfileId,
      workingDirectory: schedule.workingDirectory,
      timeout: schedule.timeout,
      cronExpression: schedule.cronExpression,
      enabled: schedule.enabled,
    });
    setActiveTab('schedules');
  };

  const resetProfileForm = () => {
    setEditingProfileId(null);
    setProfileForm(DEFAULT_PROFILE_FORM);
  };

  const resetPromptForm = () => {
    setEditingPromptId(null);
    setPromptForm(emptyPromptForm());
  };

  const resetScheduleForm = () => {
    setEditingScheduleId(null);
    setScheduleForm(emptyScheduleForm(profiles[0]?._id, directories[0]));
  };

  const submitRun = async () => {
    setRunPending(true);
    try {
      const requestBody =
        runForm.type === 'saved-prompt'
          ? {
              promptId: runForm.promptId,
              agentProfileId: runForm.agentProfileId,
              workingDirectory: runForm.workingDirectory,
              timeout: runForm.timeout,
            }
          : {
              name: runForm.name,
              content: runForm.content,
              type: runForm.type,
              agentProfileId: runForm.agentProfileId,
              workingDirectory: runForm.workingDirectory,
              timeout: runForm.timeout,
            };
      const response = await fetch('/api/modules/ai-runner/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Run failed to start');
      }

      setSelectedRun(payload);
      setRuns((current) => [payload as AIRunnerRunDTO, ...current]);
      toast({
        title: 'Run started',
        description: 'The AI agent run has started successfully.',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'Run failed',
        description: error instanceof Error ? error.message : 'Unable to execute run',
        variant: 'destructive',
      });
    } finally {
      setRunPending(false);
    }
  };

  const saveRunAsPrompt = async () => {
    try {
      if (runForm.type === 'saved-prompt') {
        toast({
          title: 'Already saved',
          description: 'This mode already uses a saved prompt from your library.',
          variant: 'warning',
        });
        return;
      }
      const name = runForm.name.trim() || 'Saved prompt';
      const response = await fetch('/api/modules/ai-runner/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          content: runForm.content,
          type: runForm.type,
          tags: [],
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to save prompt');
      }
      toast({
        title: 'Prompt saved',
        description: 'The prompt is ready for reuse.',
        variant: 'success',
      });
      await loadAll();
      setActiveTab('prompts');
    } catch (error) {
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Unable to save prompt',
        variant: 'destructive',
      });
    }
  };

  const submitProfile = async () => {
    try {
      const response = await fetch(
        editingProfileId
          ? `/api/modules/ai-runner/profiles/${editingProfileId}`
          : '/api/modules/ai-runner/profiles',
        {
          method: editingProfileId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profileForm),
        }
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to save profile');
      }
      toast({
        title: editingProfileId ? 'Profile updated' : 'Profile created',
        description: 'Agent profile settings were saved.',
        variant: 'success',
      });
      resetProfileForm();
      await loadAll();
    } catch (error) {
      toast({
        title: 'Profile save failed',
        description: error instanceof Error ? error.message : 'Unable to save profile',
        variant: 'destructive',
      });
    }
  };

  const validateProfile = async () => {
    const response = await fetch('/api/modules/ai-runner/profiles/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invocationTemplate: profileForm.invocationTemplate,
        shell: profileForm.shell,
      }),
    });
    const payload = await response.json();
    toast({
      title: payload.valid ? 'Template valid' : 'Template invalid',
      description: payload.valid
        ? payload.warnings?.join(', ') || 'Shell syntax and placeholders look good.'
        : payload.errors?.join(', ') || 'Validation failed.',
      variant: payload.valid ? 'success' : 'destructive',
    });
  };

  const testProfile = async (profileId: string) => {
    const response = await fetch(`/api/modules/ai-runner/profiles/${profileId}/test`, {
      method: 'POST',
    });
    const payload = await response.json();
    if (!response.ok) {
      toast({
        title: 'Profile test failed',
        description: payload.error || 'Unable to run the test profile',
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: 'Profile test started',
      description: 'A quick validation run is now executing.',
      variant: 'success',
    });
    setSelectedRun(payload);
    setActiveTab('run');
    await loadAll();
  };

  const deleteProfile = async (id: string) => {
    const response = await fetch(`/api/modules/ai-runner/profiles/${id}`, { method: 'DELETE' });
    const payload = await response.json();
    if (!response.ok) {
      toast({
        title: 'Delete failed',
        description: payload.error || 'Unable to delete profile',
        variant: 'destructive',
      });
      return;
    }
    if (editingProfileId === id) {
      resetProfileForm();
    }
    await loadAll();
  };

  const submitPrompt = async () => {
    try {
      const response = await fetch(
        editingPromptId
          ? `/api/modules/ai-runner/prompts/${editingPromptId}`
          : '/api/modules/ai-runner/prompts',
        {
          method: editingPromptId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(promptForm),
        }
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to save prompt');
      }
      toast({
        title: editingPromptId ? 'Prompt updated' : 'Prompt created',
        description: 'Saved prompt is ready to run or schedule.',
        variant: 'success',
      });
      resetPromptForm();
      await loadAll();
    } catch (error) {
      toast({
        title: 'Prompt save failed',
        description: error instanceof Error ? error.message : 'Unable to save prompt',
        variant: 'destructive',
      });
    }
  };

  const deletePrompt = async (id: string) => {
    const response = await fetch(`/api/modules/ai-runner/prompts/${id}`, { method: 'DELETE' });
    const payload = await response.json();
    if (!response.ok) {
      toast({
        title: 'Delete failed',
        description: payload.error || 'Unable to delete prompt',
        variant: 'destructive',
      });
      return;
    }
    if (editingPromptId === id) {
      resetPromptForm();
    }
    await loadAll();
  };

  const submitSchedule = async () => {
    try {
      const response = await fetch(
        editingScheduleId
          ? `/api/modules/ai-runner/schedules/${editingScheduleId}`
          : '/api/modules/ai-runner/schedules',
        {
          method: editingScheduleId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(scheduleForm),
        }
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to save schedule');
      }
      toast({
        title: editingScheduleId ? 'Schedule updated' : 'Schedule created',
        description: 'The schedule is ready to run automatically.',
        variant: 'success',
      });
      resetScheduleForm();
      await loadAll();
    } catch (error) {
      toast({
        title: 'Schedule save failed',
        description: error instanceof Error ? error.message : 'Unable to save schedule',
        variant: 'destructive',
      });
    }
  };

  const toggleSchedule = async (id: string) => {
    const response = await fetch(`/api/modules/ai-runner/schedules/${id}/toggle`, {
      method: 'POST',
    });
    const payload = await response.json();
    if (!response.ok) {
      toast({
        title: 'Toggle failed',
        description: payload.error || 'Unable to toggle schedule',
        variant: 'destructive',
      });
      return;
    }
    await loadAll();
  };

  const deleteSchedule = async (id: string) => {
    const response = await fetch(`/api/modules/ai-runner/schedules/${id}`, { method: 'DELETE' });
    const payload = await response.json();
    if (!response.ok) {
      toast({
        title: 'Delete failed',
        description: payload.error || 'Unable to delete schedule',
        variant: 'destructive',
      });
      return;
    }
    if (editingScheduleId === id) {
      resetScheduleForm();
    }
    await loadAll();
  };

  const openPromptInRun = (promptId: string) => {
    setSelectedPromptId(promptId);
    setRunForm((current) => ({
      ...current,
      type: 'saved-prompt',
      promptId,
    }));
    setActiveTab('run');
  };

  const runScheduleNow = async (schedule: AIRunnerScheduleDTO) => {
    const response = await fetch('/api/modules/ai-runner/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptId: schedule.promptId,
        scheduleId: schedule._id,
        triggeredBy: 'manual',
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      toast({
        title: 'Run failed',
        description: payload.error || 'Unable to start scheduled prompt',
        variant: 'destructive',
      });
      return;
    }
    setSelectedRun(payload);
    setActiveTab('run');
    await loadAll();
  };

  const killSelectedRun = async () => {
    if (!selectedRun) return;
    const response = await fetch(`/api/modules/ai-runner/runs/${selectedRun._id}/kill`, {
      method: 'POST',
    });
    const payload = await response.json();
    if (!response.ok) {
      toast({
        title: 'Stop failed',
        description: payload.error || 'Unable to stop the run',
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: 'Stop signal sent',
      description: 'The run is being terminated.',
      variant: 'success',
    });
  };

  if (loading) {
    return <PageSkeleton statCards={4} />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active Runs"
          value={activeRunCount}
          icon={<Play className="w-4 h-4 text-primary" />}
        />
        <StatCard
          label="Enabled Schedules"
          value={enabledScheduleCount}
          icon={<CalendarClock className="w-4 h-4 text-warning" />}
        />
        <StatCard
          label="Profiles"
          value={profiles.length}
          icon={<Bot className="w-4 h-4 text-success" />}
        />
        <StatCard
          label="Successful Runs"
          value={successfulRuns}
          icon={<History className="w-4 h-4 text-info" />}
        />
      </div>

      <Card className="border-border/60 overflow-hidden">
        <CardHeader className="border-b border-border/60 bg-card/60">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="w-4 h-4 text-primary" />
                AI Agent Runner
              </CardTitle>
              <CardDescription>
                Launch prompts, schedule recurring runs, and keep an audit trail of every execution.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {TAB_META.map((tab) => (
                <Button
                  key={tab.id}
                  variant={activeTab === tab.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.icon}
                  {tab.label}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadAll()}
                loading={refreshing}
              >
                <RefreshCcw className="w-4 h-4" />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          {activeTab === 'run' && (
            <div className="grid gap-5 lg:grid-cols-[1.05fr_1fr]">
              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="text-sm">Prompt Composer</CardTitle>
                  <CardDescription>
                    Run ad-hoc input or execute a saved prompt from your library.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Button
                      variant={runForm.type === 'inline' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setRunForm((current) => ({ ...current, type: 'inline' }))}
                    >
                      Inline Prompt
                    </Button>
                    <Button
                      variant={runForm.type === 'file-reference' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() =>
                        setRunForm((current) => ({ ...current, type: 'file-reference' }))
                      }
                    >
                      File Reference
                    </Button>
                    <Button
                      variant={runForm.type === 'saved-prompt' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() =>
                        setRunForm((current) => ({
                          ...current,
                          type: 'saved-prompt',
                          promptId: current.promptId || prompts[0]?._id,
                        }))
                      }
                    >
                      Saved Prompt
                    </Button>
                    {profileAgentType && (
                      <Badge variant="secondary" className="ml-auto">
                        {profileAgentType}
                      </Badge>
                    )}
                  </div>

                  {runForm.type === 'saved-prompt' ? (
                    <>
                      <label className="space-y-1.5">
                        <span className="block text-sm font-medium">Saved Prompt</span>
                        <select
                          value={runForm.promptId ?? ''}
                          onChange={(event) =>
                            setRunForm((current) => ({
                              ...current,
                              promptId: event.target.value,
                            }))
                          }
                          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                        >
                          <option value="">Select a saved prompt</option>
                          {prompts.map((prompt) => (
                            <option key={prompt._id} value={prompt._id}>
                              {prompt.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      {selectedRunPrompt ? (
                        <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold">{selectedRunPrompt.name}</h3>
                              <Badge variant="secondary">{selectedRunPrompt.type}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Reusable prompt definition. Choose how to run it below.
                            </p>
                          </div>
                          <p className="line-clamp-6 text-sm text-muted-foreground whitespace-pre-wrap">
                            {selectedRunPrompt.content}
                          </p>
                          <div className="grid gap-3 sm:grid-cols-2 text-xs">
                            <div className="rounded-lg bg-background px-3 py-2">
                              <span className="text-muted-foreground">Tags</span>
                              <p className="mt-1 font-medium">
                                {selectedRunPrompt.tags.length > 0
                                  ? selectedRunPrompt.tags.join(', ')
                                  : 'No tags'}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                          No saved prompts available yet
                        </div>
                      )}
                    </>
                  ) : runForm.type === 'inline' ? (
                    <label className="block space-y-1.5">
                      <span className="block text-sm font-medium">Prompt</span>
                      <textarea
                        value={runForm.content}
                        onChange={(event) =>
                          setRunForm((current) => ({ ...current, content: event.target.value }))
                        }
                        className="min-h-56 w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                        placeholder="Ask the AI agent to update tests, review code, or generate a feature..."
                      />
                    </label>
                  ) : (
                    <Input
                      label="Prompt File Path"
                      value={runForm.content}
                      onChange={(event) =>
                        setRunForm((current) => ({ ...current, content: event.target.value }))
                      }
                      placeholder="/root/repos/project/prompts/runner.md"
                      icon={<FolderOpen className="w-4 h-4" />}
                    />
                  )}

                  <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-4">
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold">Execution Settings</h3>
                      <p className="text-xs text-muted-foreground">
                        Pick the runtime context separately from the prompt content.
                      </p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Input
                        label="Run Label"
                        value={runForm.name}
                        onChange={(event) =>
                          setRunForm((current) => ({ ...current, name: event.target.value }))
                        }
                        placeholder="Nightly module cleanup"
                      />
                      <label className="space-y-1.5">
                        <span className="block text-sm font-medium">Agent Profile</span>
                        <select
                          value={runForm.agentProfileId}
                          onChange={(event) => {
                            const profile = profileMap[event.target.value];
                            setRunForm((current) => ({
                              ...current,
                              agentProfileId: event.target.value,
                              timeout: profile?.defaultTimeout ?? current.timeout,
                            }));
                          }}
                          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                        >
                          <option value="">Select a profile</option>
                          {profiles
                            .filter((profile) => profile.enabled)
                            .map((profile) => (
                              <option key={profile._id} value={profile._id}>
                                {profile.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>

                    <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                      <div className="space-y-1.5">
                        <label htmlFor="run-directory" className="block text-sm font-medium">
                          Working Directory
                        </label>
                        <input
                          id="run-directory"
                          list="runner-directories"
                          value={runForm.workingDirectory}
                          onChange={(event) =>
                            setRunForm((current) => ({
                              ...current,
                              workingDirectory: event.target.value,
                            }))
                          }
                          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                          placeholder="/srv/repos/project"
                        />
                        <datalist id="runner-directories">
                          {directories.map((directory) => (
                            <option key={directory} value={directory} />
                          ))}
                        </datalist>
                      </div>
                      <Input
                        label="Timeout (minutes)"
                        type="number"
                        value={runForm.timeout}
                        onChange={(event) =>
                          setRunForm((current) => ({
                            ...current,
                            timeout: Number(event.target.value) || 1,
                          }))
                        }
                        min={1}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void submitRun()} loading={runPending}>
                      <Play className="w-4 h-4" />
                      Run Now
                    </Button>
                    {runForm.type !== 'saved-prompt' && (
                      <Button variant="outline" onClick={() => void saveRunAsPrompt()}>
                        <Save className="w-4 h-4" />
                        Save Prompt
                      </Button>
                    )}
                    <div className="ml-auto rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
                      {runForm.type === 'saved-prompt'
                        ? 'Saved prompts reuse content; the execution settings come from the form above.'
                        : 'Best for one-off execution and live output.'}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60 min-h-[540px]">
                <CardHeader className="border-b border-border/60">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-sm">Live Output</CardTitle>
                      <CardDescription>
                        {selectedRun
                          ? `${selectedRun.status} • ${selectedRun.workingDirectory}`
                          : 'Run a prompt to see output here.'}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedRun && (
                        <Badge
                          variant={
                            selectedRun.status === 'completed'
                              ? 'success'
                              : selectedRun.status === 'running'
                                ? 'default'
                                : 'warning'
                          }
                        >
                          {selectedRun.status}
                        </Badge>
                      )}
                      {selectedRun?.status === 'running' && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => void killSelectedRun()}
                        >
                          <Square className="w-4 h-4" />
                          Stop
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-5">
                  {selectedRun ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-3 text-xs">
                        <div className="rounded-lg bg-secondary/40 px-3 py-2">
                          <span className="text-muted-foreground">Started</span>
                          <p className="mt-1 font-medium">
                            {new Date(selectedRun.startedAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="rounded-lg bg-secondary/40 px-3 py-2">
                          <span className="text-muted-foreground">Duration</span>
                          <p className="mt-1 font-medium">
                            {formatDuration(selectedRun.durationSeconds)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-secondary/40 px-3 py-2">
                          <span className="text-muted-foreground">Exit Code</span>
                          <p className="mt-1 font-medium">
                            {selectedRun.exitCode === undefined ? '—' : selectedRun.exitCode}
                          </p>
                        </div>
                      </div>
                      <div className="rounded-xl border border-border bg-background overflow-hidden">
                        <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
                          Clean Output
                        </div>
                        <pre className="max-h-[420px] overflow-auto px-4 py-4 text-xs leading-6 whitespace-pre-wrap font-mono">
                          {selectedRun.stdout || selectedRun.stderr || 'No output captured yet'}
                        </pre>
                      </div>
                      {selectedRun.stderr && (
                        <div className="rounded-xl border border-warning/30 bg-warning/5 overflow-hidden">
                          <div className="border-b border-warning/20 px-4 py-2 text-xs text-warning">
                            Stderr
                          </div>
                          <pre className="max-h-48 overflow-auto px-4 py-4 text-xs leading-6 whitespace-pre-wrap font-mono">
                            {selectedRun.stderr}
                          </pre>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex min-h-[440px] items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                      Run a prompt to see output here
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'prompts' && (
            <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1.1fr)_380px]">
              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="text-sm">Prompt Library</CardTitle>
                  <CardDescription>
                    Browse reusable prompt patterns instead of composing one-off runs.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl border border-border/60 bg-secondary/20 px-3 py-3">
                      <p className="text-muted-foreground">Saved</p>
                      <p className="mt-1 text-lg font-semibold">{prompts.length}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-secondary/20 px-3 py-3">
                      <p className="text-muted-foreground">File-backed</p>
                      <p className="mt-1 text-lg font-semibold">
                        {prompts.filter((prompt) => prompt.type === 'file-reference').length}
                      </p>
                    </div>
                  </div>
                  <Input
                    label="Search Library"
                    value={promptSearch}
                    onChange={(event) => setPromptSearch(event.target.value)}
                    placeholder="Search by name, tag, or content"
                    icon={<Search className="w-4 h-4" />}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={promptTypeFilter === 'all' ? 'default' : 'outline'}
                      onClick={() => setPromptTypeFilter('all')}
                    >
                      All
                    </Button>
                    <Button
                      size="sm"
                      variant={promptTypeFilter === 'inline' ? 'default' : 'outline'}
                      onClick={() => setPromptTypeFilter('inline')}
                    >
                      Inline
                    </Button>
                    <Button
                      size="sm"
                      variant={promptTypeFilter === 'file-reference' ? 'default' : 'outline'}
                      onClick={() => setPromptTypeFilter('file-reference')}
                    >
                      File-backed
                    </Button>
                  </div>
                  {selectedPrompt ? (
                    <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{selectedPrompt.type}</Badge>
                        </div>
                        <h3 className="text-sm font-semibold">{selectedPrompt.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          Portable prompt definition for manual runs and schedules.
                        </p>
                      </div>
                      <p className="line-clamp-5 text-sm text-muted-foreground whitespace-pre-wrap">
                        {selectedPrompt.content}
                      </p>
                      {selectedPrompt.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedPrompt.tags.map((tag) => (
                            <Badge key={tag} variant="outline" className="text-[10px]">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => openPromptInRun(selectedPrompt._id)}>
                          <Play className="w-4 h-4" />
                          Open in Run
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => selectPromptForEdit(selectedPrompt)}
                        >
                          Edit Selected
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                      No prompts match this filter
                    </div>
                  )}
                  <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-muted-foreground">
                    The Run tab is for ad-hoc execution. This tab is now your reusable library.
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="text-sm">Prompt Cards</CardTitle>
                  <CardDescription>
                    {filteredPrompts.length} of {prompts.length} prompt(s) visible
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {filteredPrompts.map((prompt) => (
                    <button
                      key={prompt._id}
                      type="button"
                      onClick={() => setSelectedPromptId(prompt._id)}
                      className={cn(
                        'w-full rounded-xl border border-border/60 bg-card/60 p-4 space-y-3 text-left transition-colors hover:bg-accent/30',
                        selectedPrompt?._id === prompt._id && 'border-primary/40 bg-primary/5'
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold">{prompt.name}</h3>
                            <Badge variant="secondary">{prompt.type}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {prompt.tags.length > 0 ? prompt.tags.join(' • ') : 'No tags yet'}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => openPromptInRun(prompt._id)}>
                            <Play className="w-4 h-4" />
                            Open in Run
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => selectPromptForEdit(prompt)}
                          >
                            <Save className="w-4 h-4" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => void deletePrompt(prompt._id)}
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </Button>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {prompt.content.slice(0, 220)}
                        {prompt.content.length > 220 ? '…' : ''}
                      </p>
                    </button>
                  ))}
                  {filteredPrompts.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                      No saved prompts yet
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="text-sm">
                    {editingPromptId ? 'Edit Prompt' : 'Create Prompt'}
                  </CardTitle>
                  <CardDescription>
                    Save polished prompts here, then run or schedule them from the library.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    label="Name"
                    value={promptForm.name}
                    onChange={(event) =>
                      setPromptForm((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={promptForm.type === 'inline' ? 'default' : 'outline'}
                      onClick={() => setPromptForm((current) => ({ ...current, type: 'inline' }))}
                    >
                      Inline
                    </Button>
                    <Button
                      size="sm"
                      variant={promptForm.type === 'file-reference' ? 'default' : 'outline'}
                      onClick={() =>
                        setPromptForm((current) => ({ ...current, type: 'file-reference' }))
                      }
                    >
                      File
                    </Button>
                  </div>
                  <label className="block space-y-1.5">
                    <span className="block text-sm font-medium">
                      {promptForm.type === 'inline' ? 'Prompt Content' : 'Prompt File Path'}
                    </span>
                    <textarea
                      value={promptForm.content}
                      onChange={(event) =>
                        setPromptForm((current) => ({ ...current, content: event.target.value }))
                      }
                      className="min-h-44 w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                    />
                  </label>
                  <Input
                    label="Tags (comma separated)"
                    value={promptForm.tags.join(', ')}
                    onChange={(event) =>
                      setPromptForm((current) => ({
                        ...current,
                        tags: event.target.value
                          .split(',')
                          .map((item) => item.trim())
                          .filter(Boolean),
                      }))
                    }
                  />
                  <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-muted-foreground">
                    Execution settings now live in the Run tab and on schedules, so this prompt can
                    stay reusable across profiles and repos.
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => void submitPrompt()}>
                      <Save className="w-4 h-4" />
                      {editingPromptId ? 'Update' : 'Create'}
                    </Button>
                    <Button variant="outline" onClick={resetPromptForm}>
                      Reset
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'schedules' && (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[28px] border border-primary/20 bg-gradient-to-br from-primary/15 via-background to-primary/5 p-5 shadow-[0_22px_80px_-55px_rgba(99,102,241,0.55)]">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-primary/80">
                    Live Automations
                  </p>
                  <p className="mt-3 text-3xl font-semibold tracking-tight">
                    {enabledScheduleCount}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Active schedules currently ready to wake up and run.
                  </p>
                </div>
                <div className="rounded-[28px] border border-warning/20 bg-gradient-to-br from-warning/15 via-background to-warning/5 p-5 shadow-[0_22px_80px_-55px_rgba(234,179,8,0.45)]">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-warning">
                    Next Launch
                  </p>
                  <p className="mt-3 text-lg font-semibold tracking-tight">
                    {nextSchedule?.nextRunTime
                      ? formatScheduleDate(nextSchedule.nextRunTime)
                      : 'No launch queued'}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {nextSchedule?.nextRunTime
                      ? `${nextSchedule.name} goes live ${formatRelative(nextSchedule.nextRunTime)}`
                      : 'Enable a schedule to see the next launch window.'}
                  </p>
                </div>
                <div className="rounded-[28px] border border-success/20 bg-gradient-to-br from-success/15 via-background to-success/5 p-5 shadow-[0_22px_80px_-55px_rgba(34,197,94,0.4)]">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-success">
                    Recently Active
                  </p>
                  <p className="mt-3 text-3xl font-semibold tracking-tight">
                    {recentlyActiveScheduleCount}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Schedules that have run within the last 24 hours.
                  </p>
                </div>
                <div className="rounded-[28px] border border-border/60 bg-gradient-to-br from-card via-background to-secondary/40 p-5">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                    Design Surface
                  </p>
                  <p className="mt-3 text-3xl font-semibold tracking-tight">{scheduleModeCount}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Scheduling modes represented right now, with {pausedScheduleCount} paused.
                  </p>
                </div>
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
                <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-card via-background to-primary/5 shadow-[0_28px_90px_-60px_rgba(99,102,241,0.55)]">
                  <CardHeader className="border-b border-border/60 bg-background/70 backdrop-blur">
                    <div className="space-y-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.26em] text-primary/80">
                          Automation Studio
                        </p>
                        <CardTitle className="mt-2 text-xl tracking-tight">
                          {editingScheduleId ? 'Refine this schedule' : 'Compose a new automation'}
                        </CardTitle>
                        <CardDescription className="mt-2 leading-6">
                          Pair a reusable prompt with an agent profile, shape the runtime context,
                          and craft a cadence that feels deliberate.
                        </CardDescription>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-border/60 bg-background/85 px-4 py-3">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                            Prompt
                          </p>
                          <p className="mt-1 text-sm font-semibold">{scheduleFormPromptName}</p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-background/85 px-4 py-3">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                            Profile
                          </p>
                          <p className="mt-1 text-sm font-semibold">{scheduleFormProfileName}</p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-background/85 px-4 py-3">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                            Cadence
                          </p>
                          <p className="mt-1 text-sm font-semibold">
                            {humanizeCron(scheduleForm.cronExpression)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5 pt-5">
                    <div className="rounded-[24px] border border-border/60 bg-background/80 p-4 space-y-4">
                      <div>
                        <p className="text-sm font-semibold">Identity</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Give this automation a clear name and pair it with the right prompt and
                          execution profile.
                        </p>
                      </div>
                      <Input
                        label="Name"
                        value={scheduleForm.name}
                        onChange={(event) =>
                          setScheduleForm((current) => ({ ...current, name: event.target.value }))
                        }
                        placeholder="Weekday backlog triage"
                      />
                      <label className="space-y-1.5">
                        <span className="block text-sm font-medium">Saved Prompt</span>
                        <select
                          value={scheduleForm.promptId}
                          onChange={(event) =>
                            setScheduleForm((current) => ({
                              ...current,
                              promptId: event.target.value,
                            }))
                          }
                          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                        >
                          <option value="">Select a prompt</option>
                          {prompts.map((prompt) => (
                            <option key={prompt._id} value={prompt._id}>
                              {prompt.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1.5">
                        <span className="block text-sm font-medium">Agent Profile</span>
                        <select
                          value={scheduleForm.agentProfileId}
                          onChange={(event) => {
                            const profile = profileMap[event.target.value];
                            setScheduleForm((current) => ({
                              ...current,
                              agentProfileId: event.target.value,
                              timeout: profile?.defaultTimeout ?? current.timeout,
                            }));
                          }}
                          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                        >
                          <option value="">Select a profile</option>
                          {profiles
                            .filter((profile) => profile.enabled)
                            .map((profile) => (
                              <option key={profile._id} value={profile._id}>
                                {profile.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>

                    <div className="rounded-[24px] border border-border/60 bg-background/80 p-4 space-y-4">
                      <div>
                        <p className="text-sm font-semibold">Runtime Scene</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Tell the schedule where to run and how long it is allowed to stay active.
                        </p>
                      </div>
                      <div className="grid gap-4 md:grid-cols-[1fr_160px]">
                        <div className="space-y-1.5">
                          <label htmlFor="schedule-directory" className="block text-sm font-medium">
                            Working Directory
                          </label>
                          <input
                            id="schedule-directory"
                            list="runner-directories"
                            value={scheduleForm.workingDirectory}
                            onChange={(event) =>
                              setScheduleForm((current) => ({
                                ...current,
                                workingDirectory: event.target.value,
                              }))
                            }
                            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                            placeholder="/srv/repos/project"
                          />
                          <datalist id="runner-directories">
                            {directories.map((directory) => (
                              <option key={directory} value={directory} />
                            ))}
                          </datalist>
                        </div>
                        <Input
                          label="Timeout"
                          type="number"
                          value={scheduleForm.timeout}
                          onChange={(event) =>
                            setScheduleForm((current) => ({
                              ...current,
                              timeout: Number(event.target.value) || 1,
                            }))
                          }
                          min={1}
                        />
                      </div>
                    </div>

                    <ScheduleBuilder
                      cronExpression={scheduleForm.cronExpression}
                      onChange={(value) =>
                        setScheduleForm((current) => ({ ...current, cronExpression: value }))
                      }
                    />

                    <div className="rounded-[24px] border border-border/60 bg-background/80 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <label className="flex items-center gap-3 text-sm font-medium">
                          <input
                            type="checkbox"
                            checked={scheduleForm.enabled}
                            onChange={(event) =>
                              setScheduleForm((current) => ({
                                ...current,
                                enabled: event.target.checked,
                              }))
                            }
                            className="h-4 w-4 rounded border-input"
                          />
                          Keep this schedule enabled after saving
                        </label>
                        <Badge variant={scheduleForm.enabled ? 'success' : 'warning'}>
                          {scheduleForm.enabled ? 'Auto-run on' : 'Saved as paused'}
                        </Badge>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button onClick={() => void submitSchedule()}>
                          <CalendarClock className="w-4 h-4" />
                          {editingScheduleId ? 'Update automation' : 'Create automation'}
                        </Button>
                        <Button variant="outline" onClick={resetScheduleForm}>
                          Reset
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-5">
                  <Card className="overflow-hidden border-border/60 bg-gradient-to-br from-card via-background to-secondary/30">
                    <CardHeader className="border-b border-border/60">
                      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                            Schedule Board
                          </p>
                          <CardTitle className="mt-2 text-xl tracking-tight">
                            A richer view of every automation
                          </CardTitle>
                          <CardDescription className="mt-2 leading-6">
                            Track cadence, next launches, execution context, and last-run health in
                            one place.
                          </CardDescription>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Badge variant="success">{enabledScheduleCount} enabled</Badge>
                          <Badge variant="warning">{pausedScheduleCount} paused</Badge>
                          <Badge variant="outline">{scheduleModeCount} modes in play</Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-5">
                      {sortedSchedules.map((schedule, index) => (
                        <div
                          key={schedule._id}
                          className={cn(
                            'group relative overflow-hidden rounded-[28px] border bg-card/80 p-5 shadow-[0_18px_60px_-48px_rgba(15,23,42,0.45)] transition-transform duration-200 hover:-translate-y-0.5',
                            schedule.enabled ? 'border-primary/20' : 'border-border/60 bg-muted/20'
                          )}
                        >
                          <div
                            className={cn(
                              'absolute inset-y-0 left-0 w-1.5 rounded-r-full',
                              schedule.enabled ? 'bg-primary/70' : 'bg-warning/60'
                            )}
                          />
                          <div
                            className={cn(
                              'pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full blur-3xl',
                              schedule.enabled ? 'bg-primary/10' : 'bg-warning/10'
                            )}
                          />
                          <div className="relative space-y-5">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                              <div className="min-w-0 space-y-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant={schedule.enabled ? 'success' : 'warning'}>
                                    {schedule.enabled ? 'Enabled' : 'Paused'}
                                  </Badge>
                                  <Badge variant="outline">
                                    {getScheduleModeLabel(schedule.cronExpression)}
                                  </Badge>
                                  {schedule.lastRunStatus ? (
                                    <Badge
                                      variant={getScheduleStatusVariant(schedule.lastRunStatus)}
                                    >
                                      {schedule.lastRunStatus}
                                    </Badge>
                                  ) : null}
                                  <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                                    #{index + 1}
                                  </span>
                                </div>
                                <div>
                                  <h3 className="text-xl font-semibold tracking-tight">
                                    {schedule.name}
                                  </h3>
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    {humanizeCron(schedule.cronExpression)}
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Badge variant="secondary">
                                    Prompt: {promptMap[schedule.promptId]?.name || 'Unknown prompt'}
                                  </Badge>
                                  <Badge variant="outline">
                                    Profile:{' '}
                                    {profileMap[schedule.agentProfileId]?.name || 'Unknown profile'}
                                  </Badge>
                                  <Badge variant="outline">{schedule.timeout} min runtime</Badge>
                                </div>
                              </div>
                              <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[280px] xl:grid-cols-1">
                                <div className="rounded-2xl border border-border/60 bg-background/85 px-4 py-3">
                                  <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                                    Next Launch
                                  </p>
                                  <p className="mt-1 text-sm font-semibold">
                                    {formatScheduleDate(schedule.nextRunTime)}
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {schedule.nextRunTime
                                      ? formatRelative(schedule.nextRunTime)
                                      : 'Waiting for enablement'}
                                  </p>
                                </div>
                                <div className="rounded-2xl border border-border/60 bg-background/85 px-4 py-3">
                                  <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                                    Last Activity
                                  </p>
                                  <p className="mt-1 text-sm font-semibold">
                                    {schedule.lastRunAt
                                      ? formatScheduleDate(schedule.lastRunAt)
                                      : 'No runs yet'}
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {schedule.lastRunAt
                                      ? formatRelative(schedule.lastRunAt)
                                      : 'Fresh automation'}
                                  </p>
                                </div>
                                <div className="rounded-2xl border border-border/60 bg-background/85 px-4 py-3">
                                  <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                                    Workspace
                                  </p>
                                  <p className="mt-1 truncate font-mono text-xs">
                                    {schedule.workingDirectory || 'No directory'}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                              <div className="rounded-[22px] border border-border/60 bg-background/80 px-4 py-4">
                                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                                  Cadence Snapshot
                                </p>
                                <div className="mt-3 grid gap-3 md:grid-cols-3">
                                  <div className="rounded-xl border border-border/60 bg-card px-3 py-3">
                                    <p className="text-xs text-muted-foreground">Mode</p>
                                    <p className="mt-1 text-sm font-semibold">
                                      {getScheduleModeLabel(schedule.cronExpression)}
                                    </p>
                                  </div>
                                  <div className="rounded-xl border border-border/60 bg-card px-3 py-3">
                                    <p className="text-xs text-muted-foreground">Narrative</p>
                                    <p className="mt-1 text-sm font-semibold">
                                      {humanizeCron(schedule.cronExpression)}
                                    </p>
                                  </div>
                                  <div className="rounded-xl border border-border/60 bg-card px-3 py-3">
                                    <p className="text-xs text-muted-foreground">Raw Cron</p>
                                    <p className="mt-1 font-mono text-xs">
                                      {schedule.cronExpression}
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-end justify-start gap-2 lg:justify-end">
                                <Button size="sm" onClick={() => void runScheduleNow(schedule)}>
                                  <Play className="w-4 h-4" />
                                  Run Now
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void toggleSchedule(schedule._id)}
                                >
                                  <Clock3 className="w-4 h-4" />
                                  {schedule.enabled ? 'Pause' : 'Enable'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => selectScheduleForEdit(schedule)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => void deleteSchedule(schedule._id)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                      {sortedSchedules.length === 0 && (
                        <div className="rounded-[28px] border border-dashed border-primary/25 bg-gradient-to-br from-primary/5 via-background to-warning/5 px-6 py-16 text-center">
                          <p className="text-[11px] uppercase tracking-[0.24em] text-primary/80">
                            Schedule Board
                          </p>
                          <h3 className="mt-3 text-xl font-semibold tracking-tight">
                            No automations on the board yet
                          </h3>
                          <p className="mt-3 text-sm leading-6 text-muted-foreground">
                            Create your first schedule on the left and it will appear here with its
                            cadence, launch window, and runtime scene.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
              <Card className="border-border/60">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-sm">Run History</CardTitle>
                      <CardDescription>{runTotal} run(s) tracked</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={runSearch}
                        onChange={(event) => setRunSearch(event.target.value)}
                        placeholder="Search command or prompt"
                        icon={<Search className="w-4 h-4" />}
                      />
                      <Button variant="outline" onClick={() => void loadAll(runSearch)}>
                        Search
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {runs.map((run) => (
                    <button
                      key={run._id}
                      onClick={() => setSelectedRun(run)}
                      className={cn(
                        'w-full rounded-xl border border-border/60 bg-card/60 p-4 text-left transition-colors hover:bg-accent/40',
                        selectedRun?._id === run._id && 'border-primary/50 bg-primary/5'
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant={
                                run.status === 'completed'
                                  ? 'success'
                                  : run.status === 'running'
                                    ? 'default'
                                    : 'warning'
                              }
                            >
                              {run.status}
                            </Badge>
                            <Badge variant="outline">{run.triggeredBy}</Badge>
                            <span className="truncate text-sm font-medium">
                              {profileMap[run.agentProfileId]?.name || 'Unknown profile'}
                            </span>
                          </div>
                          <p className="truncate text-sm">{run.promptContent.slice(0, 120)}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {run.workingDirectory}
                          </p>
                        </div>
                        <div className="text-right text-xs text-muted-foreground shrink-0">
                          <p>{formatRelative(run.startedAt)}</p>
                          <p>{formatDuration(run.durationSeconds)}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="text-sm">Run Detail</CardTitle>
                  <CardDescription>
                    {selectedRun
                      ? new Date(selectedRun.startedAt).toLocaleString()
                      : 'Select a run'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedRun ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2 text-xs">
                        <div className="rounded-lg bg-secondary/40 px-3 py-2">
                          <span className="text-muted-foreground">Profile</span>
                          <p className="mt-1 font-medium">
                            {profileMap[selectedRun.agentProfileId]?.name || 'Unknown profile'}
                          </p>
                        </div>
                        <div className="rounded-lg bg-secondary/40 px-3 py-2">
                          <span className="text-muted-foreground">Command</span>
                          <p className="mt-1 font-medium">{selectedRun.command.slice(0, 48)}</p>
                        </div>
                        <div className="rounded-lg bg-secondary/40 px-3 py-2">
                          <span className="text-muted-foreground">Finished</span>
                          <p className="mt-1 font-medium">
                            {selectedRun.finishedAt
                              ? new Date(selectedRun.finishedAt).toLocaleString()
                              : 'Running'}
                          </p>
                        </div>
                        <div className="rounded-lg bg-secondary/40 px-3 py-2">
                          <span className="text-muted-foreground">Resource Peak</span>
                          <p className="mt-1 font-medium">
                            {selectedRun.resourceUsage?.peakMemoryBytes
                              ? `${Math.round(selectedRun.resourceUsage.peakMemoryBytes / 1024 / 1024)} MB`
                              : '—'}
                          </p>
                        </div>
                      </div>
                      <div className="rounded-xl border border-border bg-background overflow-hidden">
                        <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
                          Output
                        </div>
                        <pre className="max-h-[420px] overflow-auto px-4 py-4 text-xs leading-6 whitespace-pre-wrap font-mono">
                          {selectedRun.stdout || selectedRun.stderr || 'No output captured'}
                        </pre>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                      Select a run to inspect the captured output
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="grid gap-5 lg:grid-cols-[400px_1fr]">
              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="text-sm">
                    {editingProfileId ? 'Edit Agent Profile' : 'Create Agent Profile'}
                  </CardTitle>
                  <CardDescription>
                    Define a reusable AI CLI profile once, then use it across runs, prompts, and
                    schedules.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <label className="block space-y-1.5">
                    <LabelWithHint
                      label="Name"
                      hint="A human-friendly label shown in dropdowns, cards, and history."
                    />
                    <Input
                      value={profileForm.name}
                      onChange={(event) => {
                        const nextName = event.target.value;
                        setProfileForm((current) => ({
                          ...current,
                          name: nextName,
                          slug:
                            editingProfileId || current.slug.trim().length > 0
                              ? current.slug
                              : slugifyValue(nextName),
                        }));
                      }}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <LabelWithHint
                      label="Slug"
                      hint="A stable machine-friendly identifier. Keep it short, unique, and URL-safe, like codex-dangerous."
                    />
                    <Input
                      value={profileForm.slug}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          slug: slugifyValue(event.target.value),
                        }))
                      }
                      placeholder="codex-dangerous"
                    />
                    <p className="text-xs text-muted-foreground">
                      Used as the durable ID behind the scenes.
                    </p>
                  </label>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-1.5">
                      <LabelWithHint
                        label="Agent Type"
                        hint="The AI CLI family this profile belongs to."
                      />
                      <select
                        value={profileForm.agentType}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            agentType: event.target.value as ProfileFormState['agentType'],
                          }))
                        }
                        className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                      >
                        {['codex', 'claude-code', 'opencode', 'aider', 'gemini-cli', 'custom'].map(
                          (type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          )
                        )}
                      </select>
                    </label>
                    <label className="block space-y-1.5">
                      <LabelWithHint
                        label="Shell"
                        hint="The shell used to execute the invocation template, usually /bin/bash."
                      />
                      <Input
                        value={profileForm.shell}
                        onChange={(event) =>
                          setProfileForm((current) => ({ ...current, shell: event.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block space-y-1.5">
                      <LabelWithHint
                        label="Default Timeout"
                        hint="How long runs should get by default before the runner stops them."
                      />
                      <Input
                        type="number"
                        value={profileForm.defaultTimeout}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            defaultTimeout: Number(event.target.value) || 1,
                          }))
                        }
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <LabelWithHint
                        label="Max Timeout"
                        hint="The hard safety cap for this profile even if a prompt asks for more."
                      />
                      <Input
                        type="number"
                        value={profileForm.maxTimeout}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            maxTimeout: Number(event.target.value) || 1,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="space-y-3 rounded-xl border border-border/60 bg-secondary/15 p-4">
                    <div className="flex items-center gap-3">
                      <ProfileIconPreview
                        icon={profileForm.icon}
                        name={profileForm.name || 'Profile'}
                      />
                      <div>
                        <LabelWithHint
                          label="Icon"
                          hint="Pick a preset icon or upload a small square image for this profile."
                        />
                        <p className="text-xs text-muted-foreground">
                          Presets are quick. Upload works well for team-specific branding.
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {ICON_PRESETS.map((preset) => {
                        const Icon = preset.icon;
                        const selected = profileForm.icon === preset.key;
                        return (
                          <button
                            key={preset.key}
                            type="button"
                            onClick={() =>
                              setProfileForm((current) => ({ ...current, icon: preset.key }))
                            }
                            className={cn(
                              'flex min-h-[72px] flex-col items-center justify-center gap-2 rounded-xl border px-2 py-3 text-xs transition-colors',
                              selected
                                ? 'border-primary bg-primary/10 text-foreground'
                                : 'border-border bg-background hover:bg-accent/40'
                            )}
                          >
                            <Icon className="h-4 w-4" />
                            <span>{preset.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <label className="inline-flex cursor-pointer items-center">
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            if (file.size > 200 * 1024) {
                              toast({
                                title: 'Image too large',
                                description:
                                  'Please upload an icon under 200 KB so profile cards stay light.',
                                variant: 'warning',
                              });
                              return;
                            }
                            const reader = new FileReader();
                            reader.onload = () => {
                              const result =
                                typeof reader.result === 'string' ? reader.result : undefined;
                              if (!result) return;
                              setProfileForm((current) => ({ ...current, icon: result }));
                            };
                            reader.readAsDataURL(file);
                            event.target.value = '';
                          }}
                        />
                        <span className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium hover:bg-accent/40">
                          Upload Icon
                        </span>
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setProfileForm((current) => ({ ...current, icon: '' }))}
                      >
                        Clear Icon
                      </Button>
                    </div>
                  </div>
                  <label className="block space-y-1.5">
                    <LabelWithHint
                      label="Invocation Template"
                      hint="The shell command template used to launch the agent. It must include $PROMPT and can include $WORKING_DIR."
                    />
                    <textarea
                      value={profileForm.invocationTemplate}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          invocationTemplate: event.target.value,
                        }))
                      }
                      className="min-h-40 w-full rounded-xl border border-input bg-background px-3 py-3 text-sm font-mono outline-none focus:ring-2 focus:ring-ring/40"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={profileForm.enabled}
                      onChange={(event) =>
                        setProfileForm((current) => ({ ...current, enabled: event.target.checked }))
                      }
                    />
                    Enabled
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void submitProfile()}>
                      <Save className="w-4 h-4" />
                      {editingProfileId ? 'Update' : 'Create'}
                    </Button>
                    <Button variant="outline" onClick={() => void validateProfile()}>
                      <TerminalSquare className="w-4 h-4" />
                      Validate
                    </Button>
                    <Button variant="outline" onClick={resetProfileForm}>
                      Reset
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="text-sm">Agent Profiles</CardTitle>
                  <CardDescription>
                    Configure reusable invocation templates for each AI CLI.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {profiles.map((profile) => (
                    <div
                      key={profile._id}
                      className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <ProfileIconPreview icon={profile.icon} name={profile.name} />
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold">{profile.name}</h3>
                              <Badge variant={profile.enabled ? 'success' : 'secondary'}>
                                {profile.enabled ? 'enabled' : 'disabled'}
                              </Badge>
                              <Badge variant="outline">{profile.agentType}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{profile.slug}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => void testProfile(profile._id)}>
                            <Play className="w-4 h-4" />
                            Test
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => selectProfileForEdit(profile)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => void deleteProfile(profile._id)}
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </Button>
                        </div>
                      </div>
                      <pre className="overflow-auto rounded-lg bg-background px-3 py-3 text-xs whitespace-pre-wrap font-mono">
                        {profile.invocationTemplate}
                      </pre>
                    </div>
                  ))}
                  {profiles.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                      No profiles configured yet
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
