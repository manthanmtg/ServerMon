import { Timer } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { CronsSnapshot } from '../../types';
import { formatCountdown } from '../time';

interface NextScheduledRunCardProps {
  nextRunJob?: string;
  nextRunTime: NonNullable<CronsSnapshot['summary']['nextRunTime']>;
  now: number;
}

export function NextScheduledRunCard({ nextRunJob, nextRunTime, now }: NextScheduledRunCardProps) {
  return (
    <Card className="border-border/60 bg-card/80">
      <CardContent className="flex items-center gap-4 p-4">
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
          <Timer className="h-6 w-6 text-primary" />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Next Scheduled Run
          </p>
          <p className="text-sm font-semibold text-foreground">
            {nextRunJob || 'Unknown job'}
            <span
              className="text-muted-foreground font-normal ml-2 font-mono whitespace-nowrap cursor-help underline decoration-dashed decoration-border underline-offset-4"
              title={new Date(nextRunTime).toLocaleString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short',
              })}
            >
              {formatCountdown(nextRunTime, now)}
            </span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(nextRunTime).toLocaleString()}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
