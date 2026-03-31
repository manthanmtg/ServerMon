'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Package, ArrowRight, CheckCircle2, XCircle, Loader2, Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WidgetCardSkeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { InstallJob, TemplateListItem } from '../types';

export default function SelfServiceWidget() {
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [jobs, setJobs] = useState<InstallJob[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [templatesRes, historyRes] = await Promise.all([
        fetch('/api/modules/self-service/templates', { cache: 'no-store' }),
        fetch('/api/modules/self-service/history', { cache: 'no-store' }),
      ]);

      if (templatesRes.ok) {
        const data = await templatesRes.json();
        setTemplates(data.templates || []);
      }
      if (historyRes.ok) {
        const data = await historyRes.json();
        setJobs(data.jobs || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) return <WidgetCardSkeleton />;

  const recentJobs = jobs.slice(0, 3);
  const successCount = jobs.filter((j) => j.status === 'success').length;
  const failedCount = jobs.filter((j) => j.status === 'failed').length;
  const runningCount = jobs.filter((j) => j.status === 'running').length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Package className="w-4 h-4" />
            Self Service
          </CardTitle>
          <a
            href="/self-service"
            className="flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            View all
            <ArrowRight className="w-3 h-3" />
          </a>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <div className="text-lg font-bold">{templates.length}</div>
            <div className="text-[10px] text-muted-foreground">Templates</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-emerald-500/5">
            <div className="text-lg font-bold text-emerald-500">{successCount}</div>
            <div className="text-[10px] text-muted-foreground">Installed</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <div className={cn('text-lg font-bold', runningCount > 0 ? 'text-blue-500' : failedCount > 0 ? 'text-destructive' : '')}>
              {runningCount > 0 ? runningCount : failedCount}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {runningCount > 0 ? 'Running' : 'Failed'}
            </div>
          </div>
        </div>

        {recentJobs.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Recent</p>
            {recentJobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-xs"
              >
                {job.status === 'success' && <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />}
                {job.status === 'failed' && <XCircle className="w-3 h-3 text-destructive shrink-0" />}
                {job.status === 'running' && <Loader2 className="w-3 h-3 text-blue-500 animate-spin shrink-0" />}
                {!['success', 'failed', 'running'].includes(job.status) && <Clock className="w-3 h-3 text-muted-foreground shrink-0" />}
                <span className="truncate flex-1">{job.templateName}</span>
                <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0">{job.methodId}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-2">
            No installations yet
          </p>
        )}
      </CardContent>
    </Card>
  );
}
