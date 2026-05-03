'use client';

import { useMemo } from 'react';
import { RefreshCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { AIRunnerLogEntry } from '../../types';
import { CompactStat } from './AIRunnerShared';
import { formatDateTime } from '../utils';

interface LogStreamViewProps {
  logEntries: AIRunnerLogEntry[];
  logStreamConnected: boolean;
  logSessionId: string;
  logLevelFilter: 'all' | AIRunnerLogEntry['level'];
  onLogLevelFilterChange: (value: 'all' | AIRunnerLogEntry['level']) => void;
  logFilePath: string;
  onRefreshTail: () => Promise<void>;
  isRefreshing: boolean;
  logsError: string | null;
  logViewportRef: React.RefObject<HTMLDivElement | null>;
}

export function LogStreamView({
  logEntries,
  logStreamConnected,
  logSessionId,
  logLevelFilter,
  onLogLevelFilterChange,
  logFilePath,
  onRefreshTail,
  isRefreshing,
  logsError,
  logViewportRef,
}: LogStreamViewProps) {
  const filteredLogEntries = useMemo(() => {
    if (logLevelFilter === 'all') return logEntries;
    return logEntries.filter((entry) => entry.level === logLevelFilter);
  }, [logEntries, logLevelFilter]);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-sm">AI Runner Debug Stream</CardTitle>
            <CardDescription>
              Restart-scoped structured logs from the queue, supervisor, and worker lifecycle.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <CompactStat
              label="Entries"
              value={logEntries.length}
              tone="primary"
              detail="Current in-browser tail for this session."
            />
            <CompactStat
              label="Stream"
              value={logStreamConnected ? 'Live' : 'Retrying'}
              tone={logStreamConnected ? 'success' : 'warning'}
              detail="SSE connection state for new log events."
            />
            <CompactStat
              label="Session"
              value={logSessionId ? logSessionId.slice(0, 8) : '—'}
              detail="Fresh log file created on each app restart."
            />
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-sm">Tail Controls</CardTitle>
            <CardDescription>
              Filter noise, inspect the current `/tmp` file, and refresh the recent tail.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Level</span>
              <select
                value={logLevelFilter}
                onChange={(event) =>
                  onLogLevelFilterChange(event.target.value as typeof logLevelFilter)
                }
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              >
                <option value="all">All levels</option>
                <option value="debug">Debug</option>
                <option value="info">Info</option>
                <option value="warn">Warn</option>
                <option value="error">Error</option>
              </select>
            </label>
            <div className="rounded-xl border border-border/60 bg-secondary/20 px-3 py-2">
              <p className="text-xs font-medium text-muted-foreground">Current log file</p>
              <p className="mt-1 break-all font-mono text-xs">{logFilePath || '—'}</p>
            </div>
            <Button
              variant="outline"
              onClick={onRefreshTail}
              loading={isRefreshing}
              className="w-full"
            >
              <RefreshCcw className="w-4 h-4" />
              Refresh Tail
            </Button>
          </CardContent>
        </Card>
      </div>

      {logsError ? (
        <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-muted-foreground">
          {logsError}
        </div>
      ) : null}

      <Card className="border-border/60">
        <CardContent className="p-0">
          <div className="grid grid-cols-[170px_170px_minmax(180px,220px)_minmax(180px,220px)_minmax(320px,1fr)] border-b border-border/60 bg-secondary/20 px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>Time</span>
            <span>Level</span>
            <span>Component</span>
            <span>Event</span>
            <span>Message & Data</span>
          </div>
          <div
            ref={logViewportRef}
            className="max-h-[620px] overflow-auto bg-background/80 font-mono text-xs"
          >
            {filteredLogEntries.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-muted-foreground">
                No AI Runner log entries match the current filter.
              </div>
            ) : (
              filteredLogEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="grid grid-cols-[170px_170px_minmax(180px,220px)_minmax(180px,220px)_minmax(320px,1fr)] gap-3 border-b border-border/40 px-4 py-3 align-top"
                >
                  <div>
                    <p>{formatDateTime(entry.timestamp)}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">pid {entry.pid}</p>
                  </div>
                  <div>
                    <Badge
                      variant={
                        entry.level === 'error'
                          ? 'destructive'
                          : entry.level === 'warn'
                            ? 'secondary'
                            : entry.level === 'info'
                              ? 'outline'
                              : 'default'
                      }
                    >
                      {entry.level}
                    </Badge>
                  </div>
                  <div className="break-all text-muted-foreground">{entry.component}</div>
                  <div className="break-all">{entry.event}</div>
                  <div className="space-y-2">
                    <p className="font-sans text-sm leading-6">{entry.message}</p>
                    {entry.data ? (
                      <pre className="overflow-x-auto rounded-lg border border-border/60 bg-secondary/20 p-3 text-[11px] leading-5 whitespace-pre-wrap break-words">
                        {JSON.stringify(entry.data, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
