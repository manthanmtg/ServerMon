'use client';

import { useCallback, useEffect, useState } from 'react';
import { Cable, LoaderCircle, Radio, Server } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PortsSnapshot } from '../types';

export default function PortsWidget() {
  const [snapshot, setSnapshot] = useState<PortsSnapshot | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/modules/ports', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setSnapshot(data);
      }
    } catch {
      // silently ignore for widget
    } finally {
      setInitialLoad(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 15000);
    return () => window.clearInterval(interval);
  }, [load]);

  if (initialLoad && !snapshot) {
    return (
      <Card className="border-border/60">
        <CardContent className="flex items-center justify-center py-12">
          <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const s = snapshot?.summary;

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Cable className="w-4 h-4 text-primary" />
            Ports
          </CardTitle>
          <Badge
            variant={snapshot?.source === 'live' ? 'success' : 'warning'}
            className="text-[10px]"
          >
            {snapshot?.source || 'unknown'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div className="flex items-center gap-1.5">
            <Radio className="w-3 h-3 text-primary" />
            <span className="text-muted-foreground">Listening</span>
            <span className="ml-auto font-semibold">{s?.totalListening ?? 0}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Server className="w-3 h-3 text-success" />
            <span className="text-muted-foreground">TCP</span>
            <span className="ml-auto font-semibold">{s?.tcpCount ?? 0}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Server className="w-3 h-3 text-warning" />
            <span className="text-muted-foreground">UDP</span>
            <span className="ml-auto font-semibold">{s?.udpCount ?? 0}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Cable className="w-3 h-3 text-muted-foreground" />
            <span className="text-muted-foreground">Processes</span>
            <span className="ml-auto font-semibold">{s?.uniqueProcesses ?? 0}</span>
          </div>
        </div>
        {snapshot?.firewall.available && (
          <div
            className={cn(
              'mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs border',
              snapshot.firewall.enabled
                ? 'bg-success/5 border-success/20'
                : 'bg-warning/5 border-warning/20'
            )}
          >
            <span
              className={cn(
                'font-medium',
                snapshot.firewall.enabled ? 'text-success' : 'text-warning'
              )}
            >
              Firewall: {snapshot.firewall.enabled ? 'Active' : 'Inactive'} (
              {snapshot.firewall.backend})
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
