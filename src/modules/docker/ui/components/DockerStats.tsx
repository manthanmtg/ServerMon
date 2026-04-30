'use client';

import { Card, CardContent } from '@/components/ui/card';
import { PlayCircle, Square, PauseCircle } from 'lucide-react';
import type { DockerSnapshot } from '../../types';

interface DockerStatsProps {
  snapshot: DockerSnapshot | null;
}

const stateTones = {
  Running: {
    color: 'text-success',
    surface: 'bg-success/5 border-success/20 hover:border-success/30 shadow-success/5',
    accent: 'bg-success',
    iconSurface: 'bg-success/10 border-success/20',
  },
  Stopped: {
    color: 'text-destructive',
    surface:
      'bg-destructive/5 border-destructive/20 hover:border-destructive/30 shadow-destructive/5',
    accent: 'bg-destructive',
    iconSurface: 'bg-destructive/10 border-destructive/20',
  },
  Paused: {
    color: 'text-warning',
    surface: 'bg-warning/5 border-warning/20 hover:border-warning/30 shadow-warning/5',
    accent: 'bg-warning',
    iconSurface: 'bg-warning/10 border-warning/20',
  },
} as const;

function stateSummary(snapshot: DockerSnapshot | null) {
  const summaries = [
    {
      label: 'Running',
      value: snapshot?.daemon.containersRunning ?? 0,
      icon: PlayCircle,
    },
    {
      label: 'Stopped',
      value: snapshot?.daemon.containersStopped ?? 0,
      icon: Square,
    },
    {
      label: 'Paused',
      value: snapshot?.daemon.containersPaused ?? 0,
      icon: PauseCircle,
    },
  ] as const;

  return summaries.map((summary) => ({
    ...summary,
    ...stateTones[summary.label],
  }));
}

export function DockerStats({ snapshot }: DockerStatsProps) {
  return (
    <section className="grid gap-4 sm:grid-cols-3">
      {stateSummary(snapshot).map(
        ({ label, value, icon: Icon, color, surface, accent, iconSurface }) => (
          <Card
            key={label}
            data-testid="docker-stat-card"
            className={`group relative overflow-hidden backdrop-blur-md transition-all hover:bg-card/80 hover:shadow-md ${surface}`}
          >
            <div className={`absolute inset-x-0 top-0 h-1 ${accent}`} />
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardContent className="flex min-h-[132px] items-center justify-between p-5 relative z-10">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium">
                  {label}
                </p>
                <p className="mt-2 text-4xl font-bold tracking-tight text-foreground transition-transform group-hover:scale-105">
                  {value}
                </p>
              </div>
              <div
                className={`rounded-2xl border p-4 transition-all group-hover:bg-muted/50 group-hover:rotate-6 ${iconSurface}`}
              >
                <Icon className={`h-7 w-7 ${color}`} />
              </div>
            </CardContent>
          </Card>
        )
      )}
    </section>
  );
}
