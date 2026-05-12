'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Database, Globe2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WidgetCardSkeleton } from '@/components/ui/skeleton';
import type { ManagedDatabaseDTO } from '../types';

type DatabaseWidgetSummary = {
  running: number;
  failed: number;
  publicCount: number;
};

type DatabaseWidgetSummaryInput = Pick<ManagedDatabaseDTO, 'status' | 'publicRoute'>;

export function deriveDatabaseWidgetSummary(
  databases: DatabaseWidgetSummaryInput[]
): DatabaseWidgetSummary {
  return databases.reduce<DatabaseWidgetSummary>(
    (summary, database) => {
      if (database.status === 'running') summary.running += 1;
      if (database.status === 'failed') summary.failed += 1;
      if (database.publicRoute) summary.publicCount += 1;
      return summary;
    },
    { running: 0, failed: 0, publicCount: 0 }
  );
}

export default function DatabasesWidget() {
  const [databases, setDatabases] = useState<ManagedDatabaseDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/modules/databases', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        setDatabases(data.databases || []);
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

  const summary = useMemo(() => deriveDatabaseWidgetSummary(databases), [databases]);
  const visibleDatabases = useMemo(() => databases.slice(0, 3), [databases]);

  if (loading) return <WidgetCardSkeleton />;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            Databases
          </CardTitle>
          <a
            href="/databases"
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
            <div className="text-lg font-bold">{databases.length}</div>
            <div className="text-[10px] text-muted-foreground">Instances</div>
          </div>
          <div className="rounded-lg bg-success/5 p-2 text-center">
            <div className="text-lg font-bold text-success">{summary.running}</div>
            <div className="text-[10px] text-muted-foreground">Running</div>
          </div>
          <div className="rounded-lg bg-warning/5 p-2 text-center">
            <div className="text-lg font-bold text-warning">{summary.publicCount}</div>
            <div className="text-[10px] text-muted-foreground">public</div>
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          {visibleDatabases.map((database) => (
            <div
              key={database.id}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
            >
              {database.status === 'running' ? (
                <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />
              ) : database.status === 'failed' ? (
                <XCircle className="h-3 w-3 shrink-0 text-destructive" />
              ) : (
                <Database className="h-3 w-3 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate">{database.name}</span>
              {database.publicRoute && (
                <Badge variant="warning" className="text-[9px]">
                  <Globe2 className="h-3 w-3" />
                  Public
                </Badge>
              )}
            </div>
          ))}
          {databases.length === 0 && (
            <p className="py-2 text-center text-xs text-muted-foreground">
              No databases deployed yet
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
