'use client';

import { useState } from 'react';
import {
  CalendarDays,
  CalendarRange,
  Clock3,
  Code2,
  Repeat2,
  TimerReset,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ScheduleBuilderMode } from '../types';
import {
  describeWeekdays,
  formatDayOfWeekField,
  formatTimeLabel,
  getDefaultCronExpressionForMode,
  getHourOptions,
  getMinuteOptions,
  getScheduleModeLabel,
  getWeekdayOptions,
  humanizeCron,
  padCronNumber,
  parseScheduleBuilder,
} from '../utils';

const MODE_OPTIONS: Array<{
  id: ScheduleBuilderMode;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    id: 'every',
    label: 'Every X Minutes',
    description: 'Pulse loop',
    icon: Repeat2,
  },
  {
    id: 'hourly',
    label: 'Hourly',
    description: 'Same minute',
    icon: TimerReset,
  },
  {
    id: 'daily',
    label: 'Daily',
    description: 'One daily run',
    icon: Clock3,
  },
  {
    id: 'weekly',
    label: 'Weekly',
    description: 'Selected weekdays',
    icon: CalendarDays,
  },
  {
    id: 'monthly',
    label: 'Monthly',
    description: 'Month day',
    icon: CalendarRange,
  },
  {
    id: 'advanced',
    label: 'Advanced Cron',
    description: 'Raw expression',
    icon: Code2,
  },
];

export function ScheduleBuilder({
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
    const nextExpression = getDefaultCronExpressionForMode(nextMode);
    if (!nextExpression) {
      setModeState({ expression: cronExpression, mode: nextMode });
      return;
    }
    updateExpression(nextExpression, nextMode);
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
    <div className="space-y-4 rounded-lg border border-border/70 bg-background/95 p-4 shadow-sm">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-primary">Cadence</p>
            <h3 className="mt-1 text-lg font-semibold">Schedule timing</h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              {humanizeCron(cronExpression)}
            </p>
          </div>
          <Badge variant="outline" className="bg-background/80">
            {modeLabel}
          </Badge>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-border/60 bg-background px-3 py-2">
            <p className="text-xs text-muted-foreground">Window</p>
            <p className="mt-1 truncate text-sm font-semibold">{timeLabel}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-background px-3 py-2">
            <p className="text-xs text-muted-foreground">Pattern</p>
            <p className="mt-1 truncate text-sm font-semibold">{patternLabel}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-background px-3 py-2">
            <p className="text-xs text-muted-foreground">Cron</p>
            <p className="mt-1 truncate font-mono text-sm font-semibold">{cronExpression}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        {MODE_OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = mode === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setModeAndExpression(option.id)}
              className={cn(
                'min-h-[84px] rounded-lg border p-3 text-left transition-colors',
                selected
                  ? 'border-primary/45 bg-primary/10 text-foreground shadow-sm'
                  : 'border-border/60 bg-card hover:border-primary/30 hover:bg-accent/20'
              )}
              aria-pressed={selected}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                    selected
                      ? 'border-primary/30 bg-background text-primary'
                      : 'border-border/60 bg-background text-muted-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{option.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{option.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-border/60 bg-card p-4">
        {mode === 'every' && (
          <div>
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
          </div>
        )}

        {mode === 'hourly' && (
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">Run every hour at</span>
              <select
                value={parsed.mode === 'hourly' ? parsed.minute : 0}
                onChange={(event) => updateTimeBasedExpression(hour, Number(event.target.value))}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              >
                {getMinuteOptions().map((value) => (
                  <option key={value} value={value}>
                    :{padCronNumber(value)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {(mode === 'daily' || mode === 'weekly' || mode === 'monthly') && (
          <div className="space-y-4">
            {mode === 'weekly' && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Run on</p>
                <div className="flex flex-wrap gap-2">
                  {getWeekdayOptions().map((option) => {
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
                  {getHourOptions().map((value) => (
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
                  {getMinuteOptions().map((value) => (
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
          <div className="space-y-3">
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
                  className="rounded-md border border-border/50 bg-background px-2 py-2 text-center"
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Preview</p>
          <p className="mt-1 truncate text-sm font-semibold">{humanizeCron(cronExpression)}</p>
        </div>
        <Badge
          variant="outline"
          className="max-w-full shrink overflow-hidden text-ellipsis whitespace-nowrap font-mono"
        >
          {cronExpression}
        </Badge>
      </div>
    </div>
  );
}
