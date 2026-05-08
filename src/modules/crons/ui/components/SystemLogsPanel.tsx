'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { CronLogEntry } from '../../types';
import { formatPastTime } from '../time';

interface SystemLogsPanelProps {
  recentLogs: CronLogEntry[];
  now: number;
}

export function SystemLogsPanel({ recentLogs, now }: SystemLogsPanelProps) {
  return (
    <Card
      id="cron-view-panel-logs"
      role="tabpanel"
      aria-labelledby="cron-view-tab-logs"
      className="border-border/60"
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Recent System Cron Logs</CardTitle>
            <p className="text-sm text-muted-foreground">Parsed from system journal or syslog.</p>
          </div>
          <Badge variant="outline">{recentLogs.length} entries</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {recentLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No recent cron logs found.
          </p>
        ) : (
          <div className="max-h-[500px] overflow-y-auto space-y-1 font-mono text-xs">
            {recentLogs.map((entry, i) => (
              <div key={i} className="flex items-start gap-3 py-1.5 px-2 rounded hover:bg-muted/20">
                <span className="text-muted-foreground shrink-0 w-[80px]">
                  {formatPastTime(entry.timestamp, now)}
                </span>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  PID {entry.pid}
                </Badge>
                <span className="text-foreground break-all">{entry.message}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
