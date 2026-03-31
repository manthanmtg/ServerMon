'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import {
  CheckCircle2, XCircle, Loader2, Circle, SkipForward, RotateCcw, ChevronDown, ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { InstallJob, StepStatusValue } from '../../types';

const STATUS_CONFIG: Record<StepStatusValue, {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  label: string;
}> = {
  pending: { icon: Circle, color: 'text-muted-foreground', label: 'Pending' },
  running: { icon: Loader2, color: 'text-blue-500', label: 'Running' },
  success: { icon: CheckCircle2, color: 'text-emerald-500', label: 'Done' },
  failed: { icon: XCircle, color: 'text-destructive', label: 'Failed' },
  skipped: { icon: SkipForward, color: 'text-muted-foreground', label: 'Skipped' },
};

const JOB_STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  pending: { color: 'bg-muted text-muted-foreground', label: 'Pending' },
  running: { color: 'bg-blue-500/10 text-blue-500', label: 'Running' },
  success: { color: 'bg-emerald-500/10 text-emerald-500', label: 'Completed' },
  failed: { color: 'bg-destructive/10 text-destructive', label: 'Failed' },
  cancelled: { color: 'bg-muted text-muted-foreground', label: 'Cancelled' },
  'rolling-back': { color: 'bg-amber-500/10 text-amber-500', label: 'Rolling Back' },
};

interface InstallProgressProps {
  jobId: string;
  onDone: () => void;
  onRollback: (jobId: string) => void;
}

export function InstallProgress({ jobId, onDone, onRollback }: InstallProgressProps) {
  const [job, setJob] = useState<InstallJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const logEndRef = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/modules/self-service/install/${jobId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch job');
      const data = await res.json();
      setJob(data.job);

      const runningStep = data.job.steps.find((s: { status: string }) => s.status === 'running');
      if (runningStep) {
        setExpandedSteps((prev) => new Set([...prev, runningStep.step]));
      }
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Failed to fetch');
    }
  }, [jobId]);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [poll]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [job]);

  const toggleStep = (step: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(step)) next.delete(step);
      else next.add(step);
      return next;
    });
  };

  if (error && !job) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const isTerminal = ['success', 'failed', 'cancelled'].includes(job.status);
  const jobStatusConf = JOB_STATUS_CONFIG[job.status] || JOB_STATUS_CONFIG.pending;
  const completedCount = job.steps.filter((s) => s.status === 'success').length;
  const totalSteps = job.steps.length;
  const progressPct = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">
                Installing {job.templateName}
                <span className="text-muted-foreground font-normal ml-1.5">via {job.methodId}</span>
              </CardTitle>
            </div>
            <Badge className={cn('text-[10px]', jobStatusConf.color)}>
              {job.status === 'running' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              {jobStatusConf.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>{completedCount}/{totalSteps} steps</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  job.status === 'failed' ? 'bg-destructive' : 'bg-primary',
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <div className="space-y-1">
            {job.steps.map((step) => {
              const conf = STATUS_CONFIG[step.status];
              const StepIcon = conf.icon;
              const isExpanded = expandedSteps.has(step.step);
              const hasLogs = step.logs.length > 0;

              return (
                <div key={step.step} className="rounded-lg border overflow-hidden">
                  <button
                    onClick={() => hasLogs && toggleStep(step.step)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors',
                      hasLogs && 'hover:bg-accent/50 cursor-pointer',
                      !hasLogs && 'cursor-default',
                    )}
                  >
                    <StepIcon
                      className={cn(
                        'w-4 h-4 shrink-0',
                        conf.color,
                        step.status === 'running' && 'animate-spin',
                      )}
                    />
                    <span className="text-xs font-medium flex-1">{step.label}</span>
                    {step.error && (
                      <span className="text-[10px] text-destructive truncate max-w-[200px]">
                        {step.error}
                      </span>
                    )}
                    {hasLogs && (
                      isExpanded
                        ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    )}
                  </button>

                  {isExpanded && hasLogs && (
                    <div className="px-3 pb-2 max-h-48 overflow-y-auto bg-muted/30">
                      <pre className="text-[10px] font-mono leading-relaxed text-muted-foreground whitespace-pre-wrap">
                        {step.logs.join('\n')}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div ref={logEndRef} />
        </CardContent>
      </Card>

      {isTerminal && (
        <div className="flex items-center justify-between">
          {job.status === 'failed' && (
            <button
              onClick={() => onRollback(job.id)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-destructive/30 text-destructive hover:bg-destructive/5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Rollback
            </button>
          )}
          <div className="ml-auto">
            <button
              onClick={onDone}
              className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {job.status === 'success' ? 'Done' : 'Back to Catalog'}
            </button>
          </div>
        </div>
      )}

      {job.status === 'success' && job.config.domain && (
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <div>
                <p className="text-sm font-medium">Installation Complete!</p>
                <p className="text-xs text-muted-foreground">
                  {job.templateName} is available at{' '}
                  <a
                    href={`https://${job.config.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    https://{String(job.config.domain)}
                  </a>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
