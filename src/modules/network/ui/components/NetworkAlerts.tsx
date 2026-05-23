import { AlertTriangle, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, relativeTime } from '@/lib/utils';
import type { NetworkSnapshot } from '../../types';

export function NetworkAlerts({ alerts }: { alerts: NetworkSnapshot['alerts'] | undefined }) {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle>Network Alerts</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {alerts && alerts.length ? (
            alerts.map((alert) => (
              <div
                key={alert.id}
                className={cn(
                  'p-3 rounded-xl border flex gap-3',
                  alert.severity === 'critical'
                    ? 'bg-destructive/5 border-destructive/20'
                    : 'bg-warning/5 border-warning/20'
                )}
              >
                <AlertTriangle
                  className={cn(
                    'h-5 w-5 shrink-0',
                    alert.severity === 'critical' ? 'text-destructive' : 'text-warning'
                  )}
                />
                <div>
                  <p className="font-semibold text-sm">{alert.title}</p>
                  <p className="text-xs text-muted-foreground">{alert.message}</p>
                  <p className="text-[10px] mt-2 text-muted-foreground uppercase font-bold tracking-wider">
                    {alert.source} • {relativeTime(alert.lastSeenAt)}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Zap className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">All systems normal</p>
              <p className="text-xs mt-1">No active network alerts detected.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
