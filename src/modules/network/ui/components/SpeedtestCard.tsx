'use client';

import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  ExternalLink,
  Gauge,
  History,
  Loader2,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { NetworkSpeedtestOverview, NetworkSpeedtestScheduleInterval } from '../../types';

export function formatMbps(value: number | undefined) {
  return typeof value === 'number' ? `${value.toFixed(2)} Mbps` : '-';
}

export function formatLatency(value: number | undefined) {
  return typeof value === 'number' ? `${value.toFixed(2)} ms` : '-';
}

export function formatSpeedtestDate(value: string | undefined) {
  if (!value) return '-';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getSafeHttpUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

const scheduleOptions: Array<{ value: NetworkSpeedtestScheduleInterval; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: '30m', label: 'Every 30 min' },
  { value: '1h', label: 'Every hour' },
  { value: '3h', label: 'Every 3 hours' },
  { value: '6h', label: 'Every 6 hours' },
  { value: '24h', label: 'Every day' },
];

interface SpeedtestCardProps {
  overview: NetworkSpeedtestOverview | null;
  historyCount: number;
  loading: boolean;
  running: boolean;
  scheduleSaving: boolean;
  onRun: () => void;
  onScheduleChange: (interval: NetworkSpeedtestScheduleInterval) => void;
  onOpenHistory: () => void;
}

export function SpeedtestCard({
  overview,
  historyCount,
  loading,
  running,
  scheduleSaving,
  onRun,
  onScheduleChange,
  onOpenHistory,
}: SpeedtestCardProps) {
  const latest = overview?.latest ?? null;
  const resultUrl = getSafeHttpUrl(latest?.resultUrl);

  return (
    <Card className="overflow-hidden border-border/60">
      <CardHeader>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-primary" />
              Internet Speedtest
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Manual and scheduled WAN throughput checks using the host speedtest CLI.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onOpenHistory} disabled={historyCount === 0}>
              <History className="h-4 w-4" />
              History
            </Button>
            <Button onClick={onRun} disabled={running}>
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Gauge className="h-4 w-4" />
              )}
              {running ? 'Running' : 'Run test'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <ArrowDown className="h-3.5 w-3.5 text-success" />
              Download
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums">
              {loading ? '-' : formatMbps(latest?.downloadMbps)}
            </p>
          </div>
          <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <ArrowUp className="h-3.5 w-3.5 text-primary" />
              Upload
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums">
              {loading ? '-' : formatMbps(latest?.uploadMbps)}
            </p>
          </div>
          <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <Zap className="h-3.5 w-3.5 text-warning" />
              Ping
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums">
              {loading ? '-' : formatLatency(latest?.pingMs)}
            </p>
          </div>
          <label className="rounded-xl border border-border/50 bg-muted/20 p-4">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5 text-accent" />
              Schedule
            </span>
            <select
              className="mt-2 w-full bg-transparent text-sm font-semibold text-foreground outline-none"
              value={overview?.settings.scheduleInterval ?? 'off'}
              onChange={(event) =>
                onScheduleChange(event.target.value as NetworkSpeedtestScheduleInterval)
              }
              disabled={scheduleSaving}
            >
              {scheduleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 text-sm lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <Badge
              variant={
                latest?.status === 'failed' ? 'destructive' : running ? 'secondary' : 'outline'
              }
            >
              {running ? 'RUNNING' : latest?.status ? latest.status.toUpperCase() : 'NO RUNS'}
            </Badge>
            <span>
              Last run {formatSpeedtestDate(latest?.finishedAt)}
              {latest?.trigger ? ` by ${latest.trigger}` : ''}
            </span>
            {overview?.settings.nextRunAt && (
              <span>Next scheduled {formatSpeedtestDate(overview.settings.nextRunAt)}</span>
            )}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="truncate">
              {latest?.serverName || 'Server unavailable'}
              {latest?.serverLocation ? ` - ${latest.serverLocation}` : ''}
            </span>
            {latest?.isp && (
              <Badge variant="outline" className="max-w-[180px] truncate">
                {latest.isp}
              </Badge>
            )}
            {resultUrl && (
              <a
                className="inline-flex items-center gap-1 text-primary hover:underline"
                href={resultUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Result
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>

        {latest?.status === 'failed' && latest.error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            {latest.error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
