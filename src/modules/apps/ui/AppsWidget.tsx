'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Boxes, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { resilientFetch } from '@/lib/fetch-utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WidgetCardSkeleton } from '@/components/ui/skeleton';
import type { ManagedAppDTO } from '../types';
import { readManagedAppsList } from './appPayload';

type AppsWidgetSummary = {
  running: number;
  failed: number;
  deploying: number;
};

type AppsWidgetSummaryInput = Pick<ManagedAppDTO, 'status'>;

export function deriveAppsWidgetSummary(apps: AppsWidgetSummaryInput[]): AppsWidgetSummary {
  return apps.reduce<AppsWidgetSummary>(
    (summary, app) => {
      if (app.status === 'running') summary.running += 1;
      if (app.status === 'failed') summary.failed += 1;
      if (app.status === 'deploying') summary.deploying += 1;
      return summary;
    },
    { running: 0, failed: 0, deploying: 0 }
  );
}

export default function AppsWidget() {
  const [apps, setApps] = useState<ManagedAppDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await resilientFetch('/api/modules/apps', {
        cache: 'no-store',
        timeout: 8000,
      });
      if (response.ok) {
        const data: unknown = await response.json();
        setApps(readManagedAppsList(data));
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

  const summary = useMemo(() => deriveAppsWidgetSummary(apps), [apps]);
  const attentionCount = summary.deploying + summary.failed;
  const visibleApps = useMemo(() => apps.slice(0, 3), [apps]);

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
            className="inline-flex min-h-11 items-center gap-1 rounded-md border border-transparent px-3 text-[11px] font-medium text-primary transition-all duration-200 hover:border-border/60 hover:bg-accent/35 hover:text-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99]"
            aria-label="View all apps"
          >
            View all
            <ArrowRight className="h-3 w-3" />
          </a>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border/50 bg-muted/45 p-2 text-center transition-colors hover:border-primary/25 hover:bg-muted/65">
            <div className="text-lg font-bold">{apps.length}</div>
            <div className="text-[10px] text-muted-foreground">Apps</div>
          </div>
          <div className="rounded-lg border border-success/20 bg-success/5 p-2 text-center transition-colors hover:border-success/40 hover:bg-success/10">
            <div className="text-lg font-bold text-success">{summary.running}</div>
            <div className="text-[10px] text-muted-foreground">Running</div>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/45 p-2 text-center transition-colors hover:border-warning/35 hover:bg-warning/15">
            <div className="text-lg font-bold">{attentionCount}</div>
            <div className="text-[10px] text-muted-foreground">Attention</div>
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          <AnimatePresence initial={false}>
            {visibleApps.map((app, index) => (
              <motion.div
                key={app.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16, delay: index * 0.03 }}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-muted/70"
              >
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
              </motion.div>
            ))}
          </AnimatePresence>
          {apps.length === 0 && (
            <p className="py-2 text-center text-xs text-muted-foreground">No apps deployed yet</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
