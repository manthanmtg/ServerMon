'use client';

import { useEffect, useRef, useState } from 'react';
import { Radio, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AppOperation, AppOperationType } from '../../types';

const operationTitles: Record<AppOperationType, string> = {
  deploy: 'Deployment logs',
  update: 'Update logs',
  rollback: 'Rollback logs',
  delete: 'Removal logs',
};

const pendingMessages: Record<AppOperationType, string> = {
  deploy: 'Starting deployment and waiting for output…',
  update: 'Checking for updates and waiting for output…',
  rollback: 'Starting rollback and waiting for output…',
  delete: 'Starting removal and waiting for output…',
};

const queuedMessages: Record<AppOperationType, string> = {
  deploy: 'Deployment queued. Waiting for build output…',
  update: 'Update queued. Waiting for build output…',
  rollback: 'Rollback queued. Waiting for output…',
  delete: 'Removal queued. Waiting for output…',
};

function operationStatus(
  operation: AppOperation | undefined,
  pendingState: 'queueing' | 'starting'
) {
  if (!operation) {
    return pendingState === 'queueing'
      ? { label: 'Queueing', variant: 'secondary' as const }
      : { label: 'Starting', variant: 'warning' as const };
  }
  if (operation.status === 'running') {
    return { label: 'Live', variant: 'warning' as const };
  }
  if (operation.status === 'failed') {
    return { label: 'Failed', variant: 'destructive' as const };
  }
  if (operation.status === 'unchanged') {
    return { label: 'Unchanged', variant: 'secondary' as const };
  }
  return { label: 'Succeeded', variant: 'success' as const };
}

function formatOperationDate(value?: string) {
  return value ? new Date(value).toLocaleString() : 'Starting now';
}

export interface AppsOperationLogsDialogProps {
  appName: string;
  operationType: AppOperationType;
  operation?: AppOperation;
  pendingState?: 'queueing' | 'starting';
  onClose: () => void;
}

export function AppsOperationLogsDialog({
  appName,
  operationType,
  operation,
  pendingState = 'starting',
  onClose,
}: AppsOperationLogsDialogProps) {
  const [autoscroll, setAutoscroll] = useState(true);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const logEndRef = useRef<HTMLSpanElement | null>(null);
  const onCloseRef = useRef(onClose);
  const title = operationTitles[operationType];
  const status = operationStatus(operation, pendingState);
  const isLive = operation?.status === 'running';
  const logs = operation?.logs ?? [];
  const emptyLogsMessage = !operation
    ? pendingState === 'queueing'
      ? pendingMessages[operationType]
      : queuedMessages[operationType]
    : isLive
      ? pendingMessages[operationType]
      : 'No logs were captured for this operation.';

  useEffect(() => {
    if (!isLive || !autoscroll) return;
    const scrollIntoView = logEndRef.current?.scrollIntoView;
    if (typeof scrollIntoView === 'function') {
      scrollIntoView.call(logEndRef.current, { block: 'end' });
    }
  }, [autoscroll, isLive, logs.length]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialogElement = dialogRef.current;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        dialogElement?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((element) => element.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) {
        event.preventDefault();
        dialogElement?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      const canRestorePreviousFocus =
        previouslyFocused?.isConnected &&
        !(previouslyFocused instanceof HTMLButtonElement && previouslyFocused.disabled) &&
        !(previouslyFocused instanceof HTMLInputElement && previouslyFocused.disabled);
      if (canRestorePreviousFocus) {
        previouslyFocused.focus();
      } else {
        const fallback = Array.from(
          document.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
          )
        ).find((element) => !dialogElement?.contains(element));
        fallback?.focus();
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-2 backdrop-blur-sm sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="operation-logs-title"
        tabIndex={-1}
        className="flex h-[min(92vh,56rem)] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl"
      >
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="operation-logs-title" className="text-lg font-semibold">
                {title}
              </h2>
              <Badge variant={status.variant}>
                {isLive && <Radio className="h-3 w-3" />}
                {status.label}
              </Badge>
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {appName} · {formatOperationDate(operation?.startedAt)}
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 sm:justify-end">
            {isLive && (
              <label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  aria-label={`Autoscroll ${title.toLowerCase()}`}
                  checked={autoscroll}
                  onChange={(event) => setAutoscroll(event.target.checked)}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                Follow live output
              </label>
            )}
            <Button
              ref={closeButtonRef}
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 shrink-0"
              aria-label={`Close ${title.toLowerCase()}`}
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col p-3 sm:p-5">
          {operation?.error && (
            <div
              role="alert"
              className="mb-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              {operation.error}
            </div>
          )}
          <pre
            role={isLive ? 'log' : undefined}
            aria-live={isLive ? 'polite' : undefined}
            aria-label={`${isLive ? 'Expanded live' : 'Expanded'} ${title.toLowerCase()} for ${appName}`}
            className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-background/70 p-4 font-mono text-xs leading-6 text-foreground sm:text-sm"
          >
            {logs.length > 0 ? logs.join('\n') : emptyLogsMessage}
            {isLive && <span ref={logEndRef} />}
          </pre>
        </div>
      </div>
    </div>
  );
}
