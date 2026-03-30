'use client';
 
import { Badge } from '@/components/ui/badge';
import { RefreshCcw } from 'lucide-react';
import type { DockerSnapshot } from '../../types';
 
interface DockerHeaderProps {
  snapshot: DockerSnapshot | null;
  refreshMs: number;
  onRefreshChange: (refreshMs: number) => void;
  onRefreshNow: () => void;
}
 
export function DockerHeader({
  snapshot,
  refreshMs,
  onRefreshChange,
  onRefreshNow,
}: DockerHeaderProps) {
  return (
    <section className="rounded-[28px] border border-border/60 bg-[radial-gradient(circle_at_top_left,var(--primary)/0.18,transparent_40%),linear-gradient(180deg,var(--card),color-mix(in_oklab,var(--card)_92%,transparent))] p-4 shadow-sm sm:p-6 backdrop-blur-md">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={snapshot?.daemonReachable ? 'success' : 'destructive'}>
              {snapshot?.daemonReachable ? 'Daemon connected' : 'Daemon unreachable'}
            </Badge>
            <Badge variant="outline" className="border-border/60 bg-background/50 backdrop-blur-sm">
              Source: {snapshot?.source || 'docker'}
            </Badge>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Docker operations center
            </h2>
            <p className="text-sm text-muted-foreground">
              Live containers, images, storage, event feed, and CLI controls in one surface.
            </p>
          </div>
        </div>
 
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex min-h-[44px] flex-col justify-center rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-xs uppercase tracking-[0.18em] text-muted-foreground shadow-inner">
            Docker host
            <select
              className="mt-1 bg-transparent text-sm font-semibold text-foreground outline-none cursor-not-allowed"
              value={snapshot?.daemon.name || 'local-engine'}
              disabled
            >
              <option>{snapshot?.daemon.name || 'local-engine'}</option>
            </select>
          </label>
          <label className="flex min-h-[44px] flex-col justify-center rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-xs uppercase tracking-[0.18em] text-muted-foreground shadow-inner">
            Refresh
            <select
              className="mt-1 bg-transparent text-sm font-semibold text-foreground outline-none cursor-pointer"
              value={String(refreshMs)}
              onChange={(event) => onRefreshChange(Number(event.target.value))}
            >
              <option value="2000">2 sec</option>
              <option value="5000">5 sec</option>
              <option value="10000">10 sec</option>
            </select>
          </label>
          <button
            type="button"
            onClick={onRefreshNow}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-sm font-semibold text-foreground transition-all hover:bg-accent hover:scale-[1.02] active:scale-[0.98] shadow-sm"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh now
          </button>
        </div>
      </div>
    </section>
  );
}
