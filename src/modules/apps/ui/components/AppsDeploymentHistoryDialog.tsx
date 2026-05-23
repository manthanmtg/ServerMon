import React from 'react';
import { XCircle, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ManagedAppDTO, AppRelease } from '../../types';

function releaseStatus(release: AppRelease) {
  if (release.status === 'failed') return { label: 'Failed', variant: 'destructive' as const };
  if (release.status === 'building') return { label: 'Building', variant: 'warning' as const };
  return { label: 'Passed', variant: 'success' as const };
}

function formatHistoryDate(value?: string) {
  if (!value) return 'Not activated';
  return new Date(value).toLocaleString();
}

export interface AppsDeploymentHistoryDialogProps {
  historyApp: ManagedAppDTO;
  rollbackTarget: string | null;
  onClose: () => void;
  onRollback: (appId: string, releaseId: string) => Promise<void>;
}

export function AppsDeploymentHistoryDialog({
  historyApp,
  rollbackTarget,
  onClose,
  onRollback,
}: AppsDeploymentHistoryDialogProps) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="deployment-history-title"
        className="w-full max-w-3xl overflow-hidden rounded-lg border border-border bg-card shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div>
            <h2 id="deployment-history-title" className="text-lg font-semibold">
              Deployment history
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{historyApp.name}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close deployment history"
            onClick={onClose}
          >
            <XCircle className="h-4 w-4" />
          </Button>
        </div>

        <div className="max-h-[70vh] overflow-auto p-5">
          {historyApp.releases.length > 0 ? (
            <div className="space-y-3">
              {[...historyApp.releases].reverse().map((release) => {
                const status = releaseStatus(release);
                const canRollback =
                  release.status !== 'active' &&
                  release.status !== 'failed' &&
                  release.status !== 'building';
                const rollbackToken = `${historyApp.id}:${release.id}`;
                return (
                  <div key={release.id} className="rounded-lg border border-border p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-sm font-medium">
                          {release.id}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Created {formatHistoryDate(release.createdAt)}
                          {release.activatedAt
                            ? ` · Activated ${formatHistoryDate(release.activatedAt)}`
                            : ''}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={status.variant}>{status.label}</Badge>
                        {canRollback && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            aria-label={`Rollback to ${release.id}`}
                            loading={rollbackTarget === rollbackToken}
                            onClick={() => void onRollback(historyApp.id, release.id)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Rollback
                          </Button>
                        )}
                      </div>
                    </div>

                    {release.error && (
                      <div className="mt-3 rounded-md border border-destructive/20 bg-destructive/10 p-2 text-xs text-destructive">
                        {release.error}
                      </div>
                    )}

                    <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs">
                      {release.logs.length > 0 ? release.logs.join('\n') : 'No logs captured.'}
                    </pre>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              No deployment history yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
