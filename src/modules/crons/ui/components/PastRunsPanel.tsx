import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CronRunStatus } from '../../types';

export function PastRunsPanel({
  jobId,
  onShowOutput,
}: {
  jobId?: string;
  onShowOutput: (run: CronRunStatus) => void;
}) {
  const [runs, setRuns] = useState<CronRunStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = jobId ? `/api/modules/crons/${jobId}/run` : '/api/modules/crons/all/run'; // Use a generic ID for global
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Unable to load run history.');
      }

      const data = (await res.json()) as CronRunStatus[];
      setRuns(data);
    } catch {
      setError('Unable to load run history.');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  if (loading)
    return (
      <div
        role="status"
        aria-label="Loading run history"
        className="text-xs text-muted-foreground animate-pulse py-4"
      >
        Loading runs...
      </div>
    );
  if (error)
    return (
      <div
        role="alert"
        className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive sm:flex-row sm:items-center sm:justify-between"
      >
        <span>{error}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadRuns()}
          className="min-h-[44px] w-full sm:w-auto"
        >
          Retry
        </Button>
      </div>
    );
  if (runs.length === 0)
    return (
      <div className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border/60 rounded-xl">
        No historical manual runs found.
      </div>
    );

  const isGlobal = !jobId;

  return (
    <div className="space-y-2">
      {!isGlobal && (
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
          MANUAL RUN HISTORY
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-border/40 bg-background/50">
        <table aria-label="Manual run history" className="min-w-[520px] text-xs">
          <thead className="bg-muted/30 border-b border-border/40">
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="py-2 px-3 text-left font-medium">Time Started</th>
              {isGlobal && <th className="py-2 px-3 text-left font-medium">Job / Command</th>}
              <th className="py-2 px-3 text-left font-medium">Status</th>
              <th className="py-2 px-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {runs.slice(0, isGlobal ? 50 : 10).map((run) => (
              <tr key={run.runId} className="hover:bg-muted/10 transition-colors">
                <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">
                  {new Date(run.startedAt).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                {isGlobal && (
                  <td className="py-2 px-3">
                    <div
                      className="font-mono text-[10px] max-w-[300px] truncate"
                      title={run.command}
                    >
                      {run.command}
                    </div>
                  </td>
                )}
                <td className="py-2 px-3">
                  <Badge
                    variant={
                      run.status === 'completed'
                        ? 'success'
                        : run.status === 'running'
                          ? 'warning'
                          : 'destructive'
                    }
                    className="text-[10px] px-1.5 py-0 h-4 uppercase"
                  >
                    {run.status}
                  </Badge>
                </td>
                <td className="py-2 px-3 text-right">
                  <Button
                    variant="ghost"
                    size="default"
                    onClick={() => onShowOutput(run)}
                    className="min-h-[44px] px-3 text-primary hover:text-primary hover:bg-primary/10 text-[10px]"
                  >
                    VIEW LOG
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {runs.length > (isGlobal ? 50 : 10) && (
          <div className="p-2 text-center text-[10px] text-muted-foreground bg-muted/5 italic border-t border-border/40">
            Showing last {isGlobal ? 50 : 10} runs
          </div>
        )}
      </div>
    </div>
  );
}
