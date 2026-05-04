import type { CronJob } from '../../types';
import { formatCountdown, useRealtimeNow } from '../time';

export function NextRunsPanel({ job }: { job: CronJob }) {
  const now = useRealtimeNow();

  if (!job.enabled || job.nextRuns.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">
        No upcoming runs (job is disabled or has no schedule).
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
        Next 5 runs
      </p>
      {job.nextRuns.map((run, i) => (
        <div key={i} className="flex items-center gap-2 text-xs py-0.5">
          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
            {i + 1}
          </span>
          <span className="text-foreground font-mono">
            {new Date(run).toLocaleString([], {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          <span
            className="text-muted-foreground ml-auto font-mono whitespace-nowrap cursor-help underline decoration-dashed decoration-muted-foreground/50 underline-offset-4"
            title={new Date(run).toLocaleString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              timeZoneName: 'short',
            })}
          >
            {formatCountdown(run, now)}
          </span>
        </div>
      ))}
    </div>
  );
}
