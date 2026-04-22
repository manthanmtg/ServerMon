'use client';

import { useCallback, useEffect, useState } from 'react';
import { Waypoints, LoaderCircle, Zap, AlertTriangle, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn, relativeTime } from '@/lib/utils';
import type { CustomEndpointDTO, EndpointsListResponse } from '../types';

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-success',
  POST: 'text-primary',
  PUT: 'text-warning',
  PATCH: 'text-info',
  DELETE: 'text-destructive',
};

export default function EndpointsWidget() {
  const [endpoints, setEndpoints] = useState<CustomEndpointDTO[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/modules/endpoints?limit=10', { cache: 'no-store' });
      if (res.ok) {
        const data: EndpointsListResponse = await res.json();
        setEndpoints(data.endpoints);
      }
    } catch {
      // silently ignore for widget
    } finally {
      setInitialLoad(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 30000);
    return () => window.clearInterval(interval);
  }, [load]);

  if (initialLoad && endpoints.length === 0) {
    return (
      <Card className="border-border/60">
        <CardContent className="flex items-center justify-center py-12">
          <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const total = endpoints.length;
  const active = endpoints.filter((e) => e.enabled).length;
  const errored = endpoints.filter((e) => e.lastStatus && e.lastStatus >= 400).length;
  const totalHits = endpoints.reduce((acc, e) => acc + e.executionCount, 0);
  const topEndpoints = [...endpoints]
    .sort((a, b) => b.executionCount - a.executionCount)
    .slice(0, 3);

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Waypoints className="w-4 h-4 text-primary" />
            Endpoints
          </CardTitle>
          <Badge variant={errored > 0 ? 'warning' : 'success'} className="text-[10px]">
            {active}/{total} active
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-success" />
            <span className="text-muted-foreground">Active</span>
            <span className="ml-auto font-semibold">{active}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3 text-warning" />
            <span className="text-muted-foreground">Errored</span>
            <span className="ml-auto font-semibold">{errored}</span>
          </div>
          <div className="flex items-center gap-1.5 col-span-2">
            <TrendingUp className="w-3 h-3 text-primary" />
            <span className="text-muted-foreground">Total Hits</span>
            <span className="ml-auto font-semibold">{totalHits.toLocaleString()}</span>
          </div>
        </div>

        {topEndpoints.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Top Endpoints
            </p>
            {topEndpoints.map((ep) => (
              <div key={ep._id} className="flex items-center gap-2 text-xs">
                <span
                  className={cn(
                    'font-mono font-bold text-[10px]',
                    METHOD_COLORS[ep.method] || 'text-foreground'
                  )}
                >
                  {ep.method}
                </span>
                <span className="truncate text-foreground">{ep.name}</span>
                <span className="ml-auto text-muted-foreground shrink-0">
                  {ep.lastExecutedAt ? relativeTime(ep.lastExecutedAt) : '—'}
                </span>
              </div>
            ))}
          </div>
        )}

        {total === 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted/50 border border-border/50 px-3 py-2 text-xs text-muted-foreground">
            <Waypoints className="w-3.5 h-3.5 shrink-0" />
            No endpoints configured yet
          </div>
        )}
      </CardContent>
    </Card>
  );
}
