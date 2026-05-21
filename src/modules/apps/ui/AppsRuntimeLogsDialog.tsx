import { XCircle, LoaderCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="runtime-logs-title"
        className="w-full max-w-3xl overflow-hidden rounded-lg border border-border bg-card shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div>
            <h2 id="runtime-logs-title" className="text-lg font-semibold">
              Runtime logs
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{app.name}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close runtime logs"
            onClick={onClose}
          >
            <XCircle className="h-4 w-4" />
          </Button>
        </div>

        <div className="max-h-[70vh] overflow-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              {error}
            </div>
          ) : logs.length > 0 ? (
            <div className="space-y-2">
              {logs.map((entry, index) => (
                <div
                  key={`${entry.timestamp}-${index}`}
                  className="rounded-md border border-border bg-muted/20 p-3 text-xs"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-muted-foreground">
                    <span>{formatRuntimeLogDate(entry.timestamp)}</span>
                    <Badge variant={entry.priority === 'err' ? 'destructive' : 'outline'}>
                      {entry.priority}
                    </Badge>
                    {entry.pid && <span>PID {entry.pid}</span>}
                  </div>
                  <pre className="whitespace-pre-wrap font-mono text-foreground">
                    {entry.message}
                  </pre>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              No runtime logs captured.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
