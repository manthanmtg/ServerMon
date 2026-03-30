'use client';
 
import { AlertTriangle, Boxes, Database } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn, formatBytes, relativeTime } from '@/lib/utils';
import type { DockerSnapshot } from '../../types';
 
interface DockerSidebarProps {
  snapshot: DockerSnapshot | null;
}
 
export function DockerSidebar({ snapshot }: DockerSidebarProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {/* Daemon Profile */}
      <Card className="border-border/60 bg-card/40 backdrop-blur-md shadow-sm overflow-hidden" data-testid="docker-sidebar">
        <CardHeader className="pb-4 border-b border-border/20 bg-muted/10">
          <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            Daemon profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-5 text-sm">
          <div className="grid gap-3">
            <div className="rounded-xl border border-border/40 bg-muted/10 p-3.5 transition-colors hover:bg-muted/20">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Version</p>
              <p className="mt-1 font-mono font-bold text-foreground">
                {snapshot?.daemon.serverVersion || 'Unavailable'}
              </p>
            </div>
            <div className="rounded-xl border border-border/40 bg-muted/10 p-3.5 transition-colors hover:bg-muted/20">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">API version</p>
              <p className="mt-1 font-mono font-bold text-foreground">
                {snapshot?.daemon.apiVersion || 'Unavailable'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border/40 bg-muted/10 p-3.5 transition-colors hover:bg-muted/20">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Driver</p>
                <p className="mt-1 font-mono text-xs font-bold truncate">
                  {snapshot?.daemon.storageDriver || 'Unavailable'}
                </p>
              </div>
              <div className="rounded-xl border border-border/40 bg-muted/10 p-3.5 transition-colors hover:bg-muted/20">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Disk usage</p>
                <p className="mt-1 font-mono font-bold">
                  {formatBytes(snapshot?.diskUsage.totalBytes || 0)}
                </p>
                <p className="text-[9px] font-medium text-muted-foreground mt-0.5">
                  {snapshot?.diskUsage.usedPercent.toFixed(1) || '0.0'}% capacity
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
 
      {/* Alerts */}
      <Card className="border-border/60 bg-card/40 backdrop-blur-md shadow-sm overflow-hidden" data-testid="docker-alerts">
        <CardHeader className="pb-4 border-b border-border/20 bg-muted/10">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
              Incidents & alerts
            </CardTitle>
            <Badge
              variant={
                snapshot?.alerts.some((alert) => alert.severity === 'critical')
                  ? 'destructive'
                  : 'outline'
              }
              className="font-mono text-[10px]"
            >
              {snapshot?.alerts.length || 0}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="max-h-[220px] overflow-y-auto space-y-3 pr-2 custom-scrollbar">
            {snapshot?.alerts.length ? (
              snapshot.alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={cn(
                    'rounded-xl border p-3.5 transition-all hover:scale-[1.02]',
                    alert.severity === 'critical'
                      ? 'border-destructive/30 bg-destructive/5 shadow-[0_0_15px_-5px_rgba(239,68,68,0.1)]'
                      : 'border-warning/30 bg-warning/5'
                  )}
                >
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      "p-2 rounded-lg",
                      alert.severity === 'critical' ? 'bg-destructive/10' : 'bg-warning/10'
                    )}>
                      <AlertTriangle
                        className={cn(
                          'h-4 w-4',
                          alert.severity === 'critical' ? 'text-destructive' : 'text-warning'
                        )}
                      />
                    </div>
                    <div>
                      <p className="font-bold text-xs">{alert.title}</p>
                      <p className="text-[10px] text-muted-foreground line-clamp-2 mt-1 opacity-80">
                        {alert.message}
                      </p>
                      <p className="mt-2 text-[8px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-2">
                        <span>{alert.source}</span>
                        <span className="w-1 h-1 rounded-full bg-border" />
                        <span>{relativeTime(alert.lastSeenAt)}</span>
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-border/40 bg-muted/5 p-8 text-center text-xs text-muted-foreground opacity-60 italic">
                System healthy. No active alerts.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
 
      {/* Events */}
      <Card className="border-border/60 bg-card/40 backdrop-blur-md shadow-sm overflow-hidden" data-testid="docker-events">
        <CardHeader className="pb-4 border-b border-border/20 bg-muted/10">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              Container events
            </CardTitle>
            <Badge variant="outline" className="font-mono text-[10px] bg-background/50 animate-pulse">Live feed</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="max-h-[220px] overflow-y-auto space-y-3 pr-2 custom-scrollbar">
            {snapshot?.events.length ? (
              snapshot.events.map((event) => (
                <div
                  key={event.id}
                  className="rounded-xl border border-border/40 bg-muted/10 p-3.5 transition-colors hover:bg-muted/20"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg border border-border/40 bg-background/50 p-2 shadow-sm group-hover:rotate-12 transition-transform">
                        <Boxes className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-bold text-xs">{event.actor}</p>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/80 mt-0.5">
                          {event.type} <span className="text-primary/60 mx-1">/</span> {event.action}
                        </p>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono font-medium text-muted-foreground/60">
                      {relativeTime(event.time)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-border/40 bg-muted/5 p-8 text-center text-xs text-muted-foreground opacity-60 italic">
                No recent activity logs.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
