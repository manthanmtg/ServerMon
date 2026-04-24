'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, Clock, RotateCcw, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { InstallJob } from '../../types';

const STATUS_CONFIG: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; color: string; label: string }
> = {
  pending: { icon: Clock, color: 'bg-muted text-muted-foreground', label: 'Pending' },
  running: { icon: Loader2, color: 'bg-blue-500/10 text-blue-500', label: 'Running' },
  success: { icon: CheckCircle2, color: 'bg-emerald-500/10 text-emerald-500', label: 'Success' },
  failed: { icon: XCircle, color: 'bg-destructive/10 text-destructive', label: 'Failed' },
  cancelled: { icon: XCircle, color: 'bg-muted text-muted-foreground', label: 'Cancelled' },
  'rolling-back': {
    icon: RotateCcw,
    color: 'bg-amber-500/10 text-amber-500',
    label: 'Rolling Back',
  },
};

interface InstallHistoryProps {
  onViewJob: (jobId: string) => void;
  onRollback: (jobId: string) => void;
}

export function InstallHistory({ onViewJob, onRollback }: InstallHistoryProps) {
  const [jobs, setJobs] = useState<InstallJob[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/modules/self-service/history', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No installation history yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Install something from the catalog to get started
        </p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Install History</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {jobs.map((job) => {
            const conf = STATUS_CONFIG[job.status] || STATUS_CONFIG.pending;
            const StatusIcon = conf.icon;
            const completedSteps = job.steps.filter((s) => s.status === 'success').length;
            const totalSteps = job.steps.length;

            return (
              <div
                key={job.id}
                className="flex items-center gap-3 p-3 rounded-lg border hover:border-primary/20 transition-colors"
              >
                <StatusIcon
                  className={cn(
                    'w-4 h-4 shrink-0',
                    job.status === 'running' && 'animate-spin',
                    job.status === 'success' && 'text-emerald-500',
                    job.status === 'failed' && 'text-destructive',
                    job.status === 'pending' && 'text-muted-foreground'
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{job.templateName}</span>
                    <Badge className={cn('text-[10px] px-1.5 py-0', conf.color)}>
                      {conf.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-muted-foreground">via {job.methodId}</span>
                    {job.config.domain && (
                      <span className="text-[11px] text-muted-foreground">
                        &bull; {String(job.config.domain)}
                      </span>
                    )}
                    {totalSteps > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        &bull; {completedSteps}/{totalSteps} steps
                      </span>
                    )}
                    {job.startedAt && (
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {formatTime(job.startedAt)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => onViewJob(job.id)}
                    className="p-1.5 rounded hover:bg-accent transition-colors"
                    title="View details"
                  >
                    <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  {(job.status === 'failed' || job.status === 'success') && (
                    <button
                      onClick={() => onRollback(job.id)}
                      className="p-1.5 rounded hover:bg-destructive/10 transition-colors"
                      title="Rollback"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60_000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  } catch {
    return isoString;
  }
}
