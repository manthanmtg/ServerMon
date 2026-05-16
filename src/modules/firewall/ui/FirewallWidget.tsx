'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, LoaderCircle, LockKeyhole, Shield, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { FirewallSnapshot } from '../types';

function scoreColor(score: number): string {
  if (score >= 85) return 'text-success';
  if (score >= 65) return 'text-warning';
  return 'text-destructive';
}

export default function FirewallWidget() {
  const [snapshot, setSnapshot] = useState<FirewallSnapshot | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/modules/firewall', { cache: 'no-store' });
      if (response.ok) {
        const data: FirewallSnapshot = await response.json();
        setSnapshot(data);
      }
    } catch {
      // Dashboard widgets stay quiet; the full page shows detailed failures.
    } finally {
      setInitialLoad(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 30000);
    return () => window.clearInterval(interval);
  }, [load]);

  if (initialLoad && !snapshot) {
    return (
      <Card className="border-border/60">
        <CardContent
          role="status"
          aria-label="Loading firewall summary"
          className="flex items-center justify-center py-12"
        >
          <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const score = snapshot?.summary.healthScore ?? 0;

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Firewall
          </CardTitle>
          <Badge variant={snapshot?.enabled ? 'success' : 'warning'} className="text-[10px]">
            {snapshot?.enabled ? 'Active' : snapshot?.available ? 'Inactive' : 'Unavailable'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div
            className={cn(
              'flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border bg-muted/30 text-xl font-bold',
              scoreColor(score)
            )}
            aria-label={`Firewall health score ${score}`}
          >
            {score}
          </div>
          <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div className="flex items-center gap-1.5">
              <LockKeyhole className="h-3 w-3 text-primary" />
              <span className="text-muted-foreground">Default In</span>
              <span className="ml-auto font-semibold capitalize">
                {snapshot?.defaultIncoming || '--'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3 w-3 text-success" />
              <span className="text-muted-foreground">Rules</span>
              <span className="ml-auto font-semibold">{snapshot?.summary.rulesCount ?? 0}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 text-warning" />
              <span className="text-muted-foreground">Exposed</span>
              <span
                className={cn(
                  'ml-auto font-semibold',
                  (snapshot?.summary.exposedWellKnownCount ?? 0) > 0 && 'text-destructive'
                )}
              >
                {snapshot?.summary.exposedWellKnownCount ?? 0}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Shield className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Backend</span>
              <span className="ml-auto font-semibold uppercase">{snapshot?.backend ?? 'none'}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
