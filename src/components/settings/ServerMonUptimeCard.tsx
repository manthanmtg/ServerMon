'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, Clock3 } from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type HealthStatus = 'online' | 'degraded' | 'unavailable';

type RuntimeState =
  | { kind: 'loading' }
  | {
      kind: 'loaded';
      status: Exclude<HealthStatus, 'unavailable'>;
      uptimeSeconds: number;
      receivedAtMs: number;
    }
  | { kind: 'unavailable' };

interface HealthResponse {
  status?: string;
  uptime?: number;
}

export function formatServerMonUptime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const remainingSeconds = totalSeconds % 60;
  const parts: string[] = [];

  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || parts.length > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length > 0) parts.push(`${minutes}m`);
  parts.push(`${remainingSeconds}s`);

  return parts.join(' ');
}

export default function ServerMonUptimeCard() {
  const [runtime, setRuntime] = useState<RuntimeState>({ kind: 'loading' });
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let active = true;

    async function loadRuntime() {
      try {
        const response = await fetch('/api/health');
        const payload = parseHealthResponse(await response.json().catch(() => null));
        if (!active) return;

        const uptimeSeconds = payload?.uptime;
        if (typeof uptimeSeconds !== 'number' || !Number.isFinite(uptimeSeconds)) {
          setRuntime({ kind: 'unavailable' });
          return;
        }

        const healthStatus = payload?.status;
        const receivedAtMs = Date.now();
        setNowMs(receivedAtMs);
        setRuntime({
          kind: 'loaded',
          status: response.ok && healthStatus === 'ok' ? 'online' : 'degraded',
          uptimeSeconds,
          receivedAtMs,
        });
      } catch {
        if (active) setRuntime({ kind: 'unavailable' });
      }
    }

    void loadRuntime();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  const status = getDisplayStatus(runtime);
  const uptimeText = useMemo(() => {
    if (runtime.kind !== 'loaded') return runtime.kind === 'loading' ? '--' : 'Unavailable';
    const elapsedSeconds = Math.floor((nowMs - runtime.receivedAtMs) / 1_000);
    return formatServerMonUptime(runtime.uptimeSeconds + elapsedSeconds);
  }, [nowMs, runtime]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Activity className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base leading-tight">ServerMon Uptime</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {runtime.kind === 'unavailable'
                  ? 'Uptime could not be loaded'
                  : 'Resets when ServerMon restarts'}
              </p>
            </div>
          </div>
          <Badge
            variant={status.variant}
            className="shrink-0 text-[10px] font-bold uppercase tracking-wider"
          >
            {status.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            'rounded-xl border border-border bg-background/70 p-4',
            runtime.kind === 'loaded' && 'bg-accent/20'
          )}
        >
          <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            <Clock3 className="w-3.5 h-3.5" />
            <span>Uptime</span>
          </div>
          <p
            className={cn(
              'font-mono text-2xl font-black leading-none text-foreground tabular-nums',
              runtime.kind === 'loading' && 'animate-pulse text-muted-foreground',
              runtime.kind === 'unavailable' && 'text-muted-foreground'
            )}
          >
            {uptimeText}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function parseHealthResponse(value: unknown): HealthResponse | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const uptime = record.uptime;

  if (typeof uptime !== 'number') return null;

  return {
    uptime,
    status: typeof record.status === 'string' ? record.status : undefined,
  };
}

function getDisplayStatus(runtime: RuntimeState): { label: string; variant: BadgeVariant } {
  if (runtime.kind === 'loading') return { label: 'Checking', variant: 'outline' };
  if (runtime.kind === 'unavailable') return { label: 'Unavailable', variant: 'outline' };
  if (runtime.status === 'online') return { label: 'Online', variant: 'success' };
  return { label: 'Degraded', variant: 'warning' };
}
