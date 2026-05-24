'use client';

import { LoaderCircle, RefreshCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CronRunStatus } from '../../types';
import { RefObject } from 'react';

interface RunOutputModalProps {
  activeRun: CronRunStatus;
  onClose: () => void;
  autoScroll: boolean;
  onToggleAutoScroll: () => void;
  stdoutRef: RefObject<HTMLPreElement | null>;
}

export function RunOutputModal({
  activeRun,
  onClose,
  autoScroll,
  onToggleAutoScroll,
  stdoutRef,
}: RunOutputModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => {
          if (activeRun.status !== 'running') onClose();
        }}
      />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-xl mx-4">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Run Output</h2>
            <Badge
              variant={
                activeRun.status === 'running'
                  ? 'warning'
                  : activeRun.status === 'completed'
                    ? 'success'
                    : 'destructive'
              }
            >
              {activeRun.status === 'running' && (
                <LoaderCircle className="w-3 h-3 mr-1 animate-spin" />
              )}
              {activeRun.status}
            </Badge>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close run output"
            className="p-2 rounded-lg hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-xs space-y-1">
            <div className="flex gap-2">
              <span className="text-muted-foreground w-20 shrink-0">Command:</span>
              <code className="font-mono text-foreground break-all">{activeRun.command}</code>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-20 shrink-0">PID:</span>
              <span className="font-mono text-foreground">{activeRun.pid}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-20 shrink-0">Started:</span>
              <span className="text-foreground">
                {new Date(activeRun.startedAt).toLocaleString()}
              </span>
            </div>
            {activeRun.finishedAt && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-20 shrink-0">Finished:</span>
                <span className="text-foreground">
                  {new Date(activeRun.finishedAt).toLocaleString()}
                </span>
              </div>
            )}
            {activeRun.exitCode !== null && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-20 shrink-0">Exit code:</span>
                <span
                  className={cn(
                    'font-mono',
                    activeRun.exitCode === 0 ? 'text-success' : 'text-destructive'
                  )}
                >
                  {activeRun.exitCode}
                </span>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Run Output
              </p>
              <button
                type="button"
                onClick={onToggleAutoScroll}
                className="text-[10px] font-medium text-muted-foreground border border-border rounded px-2 py-1 flex items-center gap-1 hover:bg-accent transition-colors"
              >
                <RefreshCcw className={cn('w-3 h-3', autoScroll && 'text-primary')} />
                Autoscroll: {autoScroll ? 'On' : 'Off'}
              </button>
            </div>
            <div className="relative">
              <pre
                ref={stdoutRef}
                className={cn(
                  'max-h-[400px] overflow-auto rounded-xl bg-muted/30 border border-border p-4 text-xs font-mono text-foreground whitespace-pre-wrap break-all',
                  !activeRun.stdout &&
                    activeRun.status !== 'running' &&
                    'flex items-center justify-center text-muted-foreground italic min-h-[100px]'
                )}
              >
                {activeRun.stdout ||
                  (activeRun.status === 'running'
                    ? 'Waiting for output...'
                    : 'No output produced by this run.')}
              </pre>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button variant="outline" size="lg" onClick={onClose} className="min-h-[44px]">
              {activeRun.status === 'running' ? 'Run in Background' : 'Close'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
