'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bot, CircleDot, Clock, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WidgetCardSkeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { AgentsSnapshot } from '../types';

function statusColor(status: string): string {
  if (status === 'running') return 'text-success';
  if (status === 'idle') return 'text-warning';
  if (status === 'waiting') return 'text-primary';
  if (status === 'error') return 'text-destructive';
  return 'text-muted-foreground';
}

function statusVariant(
  status: string
): 'success' | 'warning' | 'destructive' | 'secondary' | 'default' {
  if (status === 'running') return 'success';
  if (status === 'idle') return 'warning';
  if (status === 'error') return 'destructive';
  if (status === 'waiting') return 'default';
  return 'secondary';
}

export default function AIAgentsWidget() {
  const [snapshot, setSnapshot] = useState<AgentsSnapshot | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/modules/ai-agents', { cache: 'no-store', signal });
      if (res.ok) {
        const data = await res.json();
        if (!signal?.aborted) setSnapshot(data);
      }
    } catch {
      // silently ignore for widget
    } finally {
      if (!signal?.aborted) setInitialLoad(false);
    }
  }, []);

  // Poll while the dashboard tab is visible; pause when hidden and cancel
  // in-flight requests to keep the snapshot endpoint (which is expensive on
  // the server) from being hammered in the background.
  useEffect(() => {
    let interval: number | null = null;
    let controller: AbortController | null = null;

    const tick = () => {
      controller?.abort();
      controller = new AbortController();
      void load(controller.signal);
    };

    const start = () => {
      if (interval !== null) return;
      tick();
      interval = window.setInterval(tick, 15_000);
    };

    const stop = () => {
      if (interval !== null) {
        window.clearInterval(interval);
        interval = null;
      }
      controller?.abort();
      controller = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [load]);

  if (initialLoad && !snapshot) {
    return <WidgetCardSkeleton />;
  }

  const s = snapshot?.summary;
  const sessions = snapshot?.sessions ?? [];

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" />
            AI Agents
          </CardTitle>
          <Badge variant={sessions.length > 0 ? 'success' : 'secondary'} className="text-[10px]">
            {sessions.length > 0 ? 'active' : 'none'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div className="flex items-center gap-1.5">
            <CircleDot className="w-3 h-3 text-success" />
            <span className="text-muted-foreground">Running</span>
            <span className="ml-auto font-semibold">{s?.running ?? 0}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-warning" />
            <span className="text-muted-foreground">Idle</span>
            <span className="ml-auto font-semibold">{s?.idle ?? 0}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3 text-destructive" />
            <span className="text-muted-foreground">Error</span>
            <span
              className={cn('ml-auto font-semibold', (s?.error ?? 0) > 0 && 'text-destructive')}
            >
              {s?.error ?? 0}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Bot className="w-3 h-3 text-muted-foreground" />
            <span className="text-muted-foreground">Total</span>
            <span className="ml-auto font-semibold">{s?.total ?? 0}</span>
          </div>
        </div>

        {sessions.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {sessions.slice(0, 3).map((session) => (
              <div
                key={session.id}
                className="flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2 text-xs"
              >
                <CircleDot className={cn('w-3 h-3 shrink-0', statusColor(session.status))} />
                <span className="font-medium truncate">{session.agent.displayName}</span>
                {session.environment.repository && (
                  <span className="text-muted-foreground truncate">
                    {session.environment.repository}
                  </span>
                )}
                <Badge
                  variant={statusVariant(session.status)}
                  className="ml-auto text-[10px] shrink-0"
                >
                  {session.status}
                </Badge>
              </div>
            ))}
            {sessions.length > 3 && (
              <p className="text-[10px] text-muted-foreground text-center">
                +{sessions.length - 3} more session{sessions.length - 3 !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        )}

        {sessions.length === 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
            <Bot className="w-3.5 h-3.5 shrink-0" />
            No active AI agent sessions detected
          </div>
        )}
      </CardContent>
    </Card>
  );
}
