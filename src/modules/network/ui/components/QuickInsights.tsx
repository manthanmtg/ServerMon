import { Activity, Globe, Network, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBytes } from '@/lib/utils';
import type { NetworkSnapshot } from '../../types';

export function QuickInsights({ snapshot }: { snapshot: NetworkSnapshot | null }) {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle>Quick Insights</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl bg-muted/30 border border-border/40">
          <Activity className="h-5 w-5 text-primary mb-2" />
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Avg Throughput
          </p>
          <p className="text-xl font-bold mt-1">
            {formatBytes(snapshot?.stats.reduce((acc, s) => acc + s.rx_sec + s.tx_sec, 0) || 0)}
            /s
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-muted/30 border border-border/40">
          <Network className="h-5 w-5 text-success mb-2" />
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Interfaces
          </p>
          <p className="text-xl font-bold mt-1">{snapshot?.interfaces.length || 0}</p>
        </div>
        <div className="p-4 rounded-2xl bg-muted/30 border border-border/40">
          <Globe className="h-5 w-5 text-accent mb-2" />
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Total Connections
          </p>
          <p className="text-xl font-bold mt-1">{snapshot?.connections.length || 0}</p>
        </div>
        <div className="p-4 rounded-2xl bg-muted/30 border border-border/40">
          <Shield className="h-5 w-5 text-destructive mb-2" />
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Errors/Drops
          </p>
          <p className="text-xl font-bold mt-1">
            {snapshot?.stats.reduce(
              (acc, s) => acc + s.rx_errors + s.tx_errors + s.rx_dropped + s.tx_dropped,
              0
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
