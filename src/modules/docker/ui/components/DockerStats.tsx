'use client';

import { Card, CardContent } from '@/components/ui/card';
import { PlayCircle, Square, PauseCircle } from 'lucide-react';
import type { DockerSnapshot } from '../../types';

interface DockerStatsProps {
  snapshot: DockerSnapshot | null;
}

function stateSummary(snapshot: DockerSnapshot | null) {
  if (!snapshot) {
    return [
      { label: 'Running', value: 0, icon: PlayCircle, color: 'text-success' },
      { label: 'Stopped', value: 0, icon: Square, color: 'text-destructive' },
      { label: 'Paused', value: 0, icon: PauseCircle, color: 'text-warning' },
    ];
  }
  return [
    {
      label: 'Running',
      value: snapshot.daemon.containersRunning,
      icon: PlayCircle,
      color: 'text-success',
    },
    {
      label: 'Stopped',
      value: snapshot.daemon.containersStopped,
      icon: Square,
      color: 'text-destructive',
    },
    {
      label: 'Paused',
      value: snapshot.daemon.containersPaused,
      icon: PauseCircle,
      color: 'text-warning',
    },
  ];
}

export function DockerStats({ snapshot }: DockerStatsProps) {
  return (
    <section className="grid gap-4 sm:grid-cols-3">
      {stateSummary(snapshot).map(({ label, value, icon: Icon, color }) => (
        <Card
          key={label}
          className="border-border/60 bg-card/50 backdrop-blur-md transition-all hover:bg-card/80 hover:shadow-md group overflow-hidden relative"
        >
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
            <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 transition-all group-hover:bg-muted/50 group-hover:rotate-6">
              <Icon className={`h-7 w-7 ${color}`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
