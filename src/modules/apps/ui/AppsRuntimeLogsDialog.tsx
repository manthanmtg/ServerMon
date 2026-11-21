'use client';

import { LoaderCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/Dialog';
import type { AppLogEntry, ManagedAppDTO } from '../types';

interface AppsRuntimeLogsDialogProps {
  app: ManagedAppDTO;
  logs: AppLogEntry[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

function formatRuntimeLogDate(value?: string) {
  if (!value) return 'Not activated';
  return new Date(value).toLocaleString();
}

export function AppsRuntimeLogsDialog({
  app,
  logs,
  loading,
  error,
  onClose,
}: AppsRuntimeLogsDialogProps) {
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Runtime logs"
      description={app.name}
      size="lg"
    >
      {loading ? (
        <div className="flex items-center justify-center py-12" role="status">
          <LoaderCircle className="h-5 w-5 animate-spin text-primary motion-reduce:animate-none" />
          <span className="sr-only">Loading runtime logs</span>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      ) : logs.length > 0 ? (
        <div className="space-y-2" role="log" aria-label={`Runtime logs for ${app.name}`}>
          {logs.map((entry, index) => (
            <article
              key={`${entry.timestamp}-${index}`}
              className="rounded-xl border border-border bg-muted/20 p-3 text-xs"
            >
              <div className="mb-1 flex flex-wrap items-center gap-2 text-muted-foreground">
                <span>{formatRuntimeLogDate(entry.timestamp)}</span>
                <Badge variant={entry.priority === 'err' ? 'destructive' : 'outline'}>
                  {entry.priority}
                </Badge>
                {entry.pid && <span>PID {entry.pid}</span>}
              </div>
              <pre className="whitespace-pre-wrap break-words font-mono text-foreground">
                {entry.message}
              </pre>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          No runtime logs captured.
        </div>
      )}
    </Dialog>
  );
}
