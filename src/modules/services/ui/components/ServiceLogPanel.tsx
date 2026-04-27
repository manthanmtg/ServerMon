'use client';

import { useEffect, useRef, useState } from 'react';
import { Activity, LoaderCircle, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ServiceLogEntry } from '../../types';

export interface ServiceLogPanelProps {
  serviceName: string;
}

function logPriorityVariant(priority: string): 'destructive' | 'warning' | 'default' | 'secondary' {
  if (priority === 'emerg' || priority === 'alert' || priority === 'crit' || priority === 'err')
    return 'destructive';
  if (priority === 'warning') return 'warning';
  if (priority === 'notice') return 'default';
  return 'secondary';
}

export function ServiceLogPanel({ serviceName }: ServiceLogPanelProps) {
  const [logs, setLogs] = useState<ServiceLogEntry[] | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    function fetchLogs() {
      fetch(`/api/modules/services/${encodeURIComponent(serviceName)}/logs?lines=30`, {
        cache: 'no-store',
      })
        .then((r) => r.json())
        .then((data) => {
          if (active) setLogs(data.logs || []);
        })
        .catch(() => {
          if (active) setLogs([]);
        });
    }

    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [serviceName]);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const loading = logs === null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!loading && logs.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">No logs available.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Activity className="w-3 h-3" /> Recent logs
        </p>
        <button
          type="button"
          onClick={() => setAutoScroll(!autoScroll)}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border',
            autoScroll
              ? 'bg-primary/10 text-primary border-primary/20'
              : 'bg-muted/50 text-muted-foreground border-border/60 hover:bg-muted'
          )}
        >
          <RotateCcw
            className={cn('w-3 h-3 transition-transform', autoScroll && 'animate-spin-slow')}
          />
          {autoScroll ? 'Autoscroll: ON' : 'Autoscroll: OFF'}
        </button>
      </div>
      <div
        ref={logContainerRef}
        className="max-h-[240px] overflow-y-auto space-y-1 font-mono text-xs custom-scrollbar scroll-smooth p-2 rounded-xl bg-black/20 border border-border/40"
      >
        {logs.map((entry, i) => (
          <div key={i} className="flex items-start gap-2 py-0.5">
            <Badge
              variant={logPriorityVariant(entry.priority)}
              className="shrink-0 text-[10px] px-1.5 py-0 min-w-[48px] justify-center"
            >
              {entry.priority}
            </Badge>
            <span className="text-muted-foreground shrink-0 w-[140px]">
              {new Date(entry.timestamp).toLocaleString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                month: 'short',
                day: 'numeric',
              })}
            </span>
            <span className="text-foreground break-all">{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
