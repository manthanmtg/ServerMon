'use client';

import { useState } from 'react';
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
                {getMinuteOptions().map((value) => (
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
