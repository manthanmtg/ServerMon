'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bot, CalendarClock, CircleDot, Play, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WidgetCardSkeleton } from '@/components/ui/skeleton';
import type {
  AIRunnerRunDTO,
  AIRunnerRunsResponse,
  AIRunnerScheduleDTO,
} from '@/modules/ai-runner/types';

function formatRelative(iso?: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.round(diff / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function AIRunnerWidget() {
  const [activeRuns, setActiveRuns] = useState<AIRunnerRunDTO[]>([]);
  const [recentRuns, setRecentRuns] = useState<AIRunnerRunDTO[]>([]);
  const [nextSchedule, setNextSchedule] = useState<AIRunnerScheduleDTO | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [activeRes, recentRes, scheduleRes] = await Promise.all([
        fetch('/api/modules/ai-runner/runs/active', { cache: 'no-store' }),
        fetch('/api/modules/ai-runner/runs?limit=5', { cache: 'no-store' }),
        fetch('/api/modules/ai-runner/schedules?enabled=true&limit=1', { cache: 'no-store' }),
      ]);

      if (activeRes.ok) {
        setActiveRuns(await activeRes.json());
      }

      if (recentRes.ok) {
        const payload: AIRunnerRunsResponse = await recentRes.json();
        setRecentRuns(payload.runs);
      }

      if (scheduleRes.ok) {
        const schedules: AIRunnerScheduleDTO[] = await scheduleRes.json();
        setNextSchedule(schedules[0] ?? null);
      }
    } catch {
      // Keep widget resilient
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [load]);

  if (loading) {
    return <WidgetCardSkeleton />;
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            AI Runner
          </CardTitle>
          <Badge variant={activeRuns.length > 0 ? 'success' : 'secondary'} className="text-[10px]">
            {activeRuns.length > 0 ? `${activeRuns.length} active` : 'idle'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <CircleDot className="w-3 h-3 text-success" />
            <span className="text-muted-foreground">Running</span>
            <span className="ml-auto font-semibold">{activeRuns.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Play className="w-3 h-3 text-primary" />
            <span className="text-muted-foreground">Recent</span>
            <span className="ml-auto font-semibold">{recentRuns.length}</span>
          </div>
          <div className="flex items-center gap-1.5 col-span-2">
            <CalendarClock className="w-3 h-3 text-warning" />
            <span className="text-muted-foreground">Next Schedule</span>
            <span className="ml-auto font-semibold truncate">
              {nextSchedule?.nextRunTime ? formatRelative(nextSchedule.nextRunTime) : 'None'}
            </span>
          </div>
        </div>

        {recentRuns.length > 0 ? (
          <div className="space-y-1.5">
            {recentRuns.slice(0, 3).map((run) => (
              <div
                key={run._id}
                className="flex items-center gap-2 rounded-lg bg-secondary/40 px-3 py-2 text-xs"
              >
                <Bot className="w-3 h-3 text-primary shrink-0" />
                <span className="truncate">{run.promptContent.slice(0, 42)}</span>
                <Badge
                  variant={
                    run.status === 'completed'
                      ? 'success'
                      : run.status === 'running'
                        ? 'default'
                        : 'warning'
                  }
                  className="ml-auto text-[10px]"
                >
                  {run.status}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
            No AI runner activity yet
          </div>
        )}
      </CardContent>
    </Card>
  );
}
