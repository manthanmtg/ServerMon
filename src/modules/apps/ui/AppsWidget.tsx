'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Boxes, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WidgetCardSkeleton } from '@/components/ui/skeleton';
import type { ManagedAppDTO } from '../types';

export default function AppsWidget() {
  const [apps, setApps] = useState<ManagedAppDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/modules/apps', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        setApps(data.apps || []);
      }
    } catch {
      // Keep dashboard widgets quiet when a module endpoint is unavailable.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 15000);
    return () => window.clearInterval(interval);
  }, [load]);

  const summary = useMemo(
    () => ({
      running: apps.filter((app) => app.status === 'running').length,
      failed: apps.filter((app) => app.status === 'failed').length,
      deploying: apps.filter((app) => app.status === 'deploying').length,
    }),
    [apps]
  );

  if (loading) return <WidgetCardSkeleton />;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-primary" />
            Apps
          </CardTitle>
          <a
            href="/apps"
            className="flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            View all
            <ArrowRight className="h-3 w-3" />
          </a>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-muted/50 p-2 text-center">
            <div className="text-lg font-bold">{apps.length}</div>
            <div className="text-[10px] text-muted-foreground">Apps</div>
          </div>
          <div className="rounded-lg bg-success/5 p-2 text-center">
            <div className="text-lg font-bold text-success">{summary.running}</div>
            <div className="text-[10px] text-muted-foreground">Running</div>
          </div>
          <div className="rounded-lg bg-muted/50 p-2 text-center">
            <div className="text-lg font-bold">{summary.deploying || summary.failed}</div>
            <div className="text-[10px] text-muted-foreground">
              {summary.deploying ? 'Deploying' : 'Failed'}
            </div>
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          {apps.slice(0, 3).map((app) => (
            <div key={app.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs">
              {app.status === 'running' ? (
                <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />
              ) : app.status === 'failed' ? (
                <XCircle className="h-3 w-3 shrink-0 text-destructive" />
              ) : (
                <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate">{app.name}</span>
              <Badge variant="outline" className="max-w-[90px] truncate text-[9px]">
                {app.domain}
              </Badge>
            </div>
          ))}
          {apps.length === 0 && (
            <p className="py-2 text-center text-xs text-muted-foreground">No apps deployed yet</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
