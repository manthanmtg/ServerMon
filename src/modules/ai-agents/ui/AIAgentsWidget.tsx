'use client';

import { Bot, CircleDot, Clock, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WidgetCardSkeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { WIDGET_POLL_INTERVAL_MS } from './constants';
import { statusTextColor, statusVariant } from './utils';
import { useAgentsSnapshot } from './useAgentsSnapshot';

export default function AIAgentsWidget() {
  const { snapshot, loading } = useAgentsSnapshot({ pollIntervalMs: WIDGET_POLL_INTERVAL_MS });

  if (loading && !snapshot) {
    return <WidgetCardSkeleton />;
  }

  const s = snapshot?.summary;
  const sessions = snapshot?.sessions ?? [];

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" />
            AI Agents
          </CardTitle>
          <Badge variant={sessions.length > 0 ? 'success' : 'secondary'} className="text-[10px]">
            {sessions.length > 0 ? 'active' : 'none'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div className="flex items-center gap-1.5">
            <CircleDot className="w-3 h-3 text-success" />
            <span className="text-muted-foreground">Running</span>
            <span className="ml-auto font-semibold">{s?.running ?? 0}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-warning" />
            <span className="text-muted-foreground">Idle</span>
            <span className="ml-auto font-semibold">{s?.idle ?? 0}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3 text-destructive" />
            <span className="text-muted-foreground">Error</span>
            <span
              className={cn('ml-auto font-semibold', (s?.error ?? 0) > 0 && 'text-destructive')}
            >
              {s?.error ?? 0}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Bot className="w-3 h-3 text-muted-foreground" />
            <span className="text-muted-foreground">Total</span>
            <span className="ml-auto font-semibold">{s?.total ?? 0}</span>
          </div>
        </div>

        {sessions.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {sessions.slice(0, 3).map((session) => (
              <div
                key={session.id}
                className="flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2 text-xs"
              >
                <CircleDot className={cn('w-3 h-3 shrink-0', statusTextColor(session.status))} />
                <span className="font-medium truncate">{session.agent.displayName}</span>
                {session.environment.repository && (
                  <span className="text-muted-foreground truncate">
                    {session.environment.repository}
                  </span>
                )}
                <Badge
                  variant={statusVariant(session.status)}
                  className="ml-auto text-[10px] shrink-0"
                >
                  {session.status}
                </Badge>
              </div>
            ))}
            {sessions.length > 3 && (
              <p className="text-[10px] text-muted-foreground text-center">
                +{sessions.length - 3} more session{sessions.length - 3 !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        )}

        {sessions.length === 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
            <Bot className="w-3.5 h-3.5 shrink-0" />
            No active AI agent sessions detected
          </div>
        )}
      </CardContent>
    </Card>
  );
}
