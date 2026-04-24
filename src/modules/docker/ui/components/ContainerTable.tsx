'use client';

import { Fragment } from 'react';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, formatBytes, relativeTime } from '@/lib/utils';
import type { DockerSnapshot } from '../../types';

interface ContainerTableProps {
  snapshot: DockerSnapshot | null;
  expandedId: string | null;
  pendingActionId: string | null;
  onExpand: (id: string | null) => void;
  onAction: (id: string, action: 'start' | 'stop' | 'restart' | 'remove') => void;
  onLogs: (id: string, name: string) => void;
  onExec: (id: string, name: string) => void;
}

function statusVariant(state: string): 'success' | 'warning' | 'destructive' {
  if (state === 'running') return 'success';
  if (state === 'paused' || state === 'restarting') return 'warning';
  return 'destructive';
}

export function ContainerTable({
  snapshot,
  expandedId,
  pendingActionId,
  onExpand,
  onAction,
  onLogs,
  onExec,
}: ContainerTableProps) {
  return (
    <Card
      className="border-border/60 bg-card/50 backdrop-blur-md shadow-sm overflow-hidden"
      data-testid="docker-containers-table"
    >
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-xl font-bold tracking-tight">Containers</CardTitle>
            <p className="text-sm text-muted-foreground">
              Status badges, live resource usage, ports, networks, and one-click actions.
            </p>
          </div>
          <Badge variant="outline" className="bg-background/40 font-mono">
            {snapshot?.containers.length || 0} containers
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-widest text-muted-foreground font-semibold bg-muted/20">
            <tr>
              <th className="py-4 px-4">Container</th>
              <th className="py-4 px-4">Image</th>
              <th className="py-4 px-4">Status</th>
              <th className="py-4 px-4">Ports</th>
              <th className="py-4 px-4">Created</th>
              <th className="py-4 px-4">Networks</th>
              <th className="py-4 px-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {(snapshot?.containers || []).map((container) => {
              const expanded = expandedId === container.id;
              const isPending = pendingActionId === container.id;

              return (
                <Fragment key={container.id}>
                  <tr
                    className={cn(
                      'group transition-colors align-top hover:bg-muted/30',
                      expanded && 'bg-muted/10 border-l-2 border-primary'
                    )}
                  >
                    <td className="py-2 px-4 min-w-[200px]">
                      <button
                        type="button"
                        className="flex min-h-[48px] items-center gap-3 text-left w-full"
                        onClick={() => onExpand(expanded ? null : container.id)}
                      >
                        <div className="rounded-md border border-border/60 bg-background/50 p-1 group-hover:bg-background transition-colors">
                          {expanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                            {container.name}
                          </div>
                          <div className="text-[10px] uppercase font-mono text-muted-foreground tracking-tighter">
                            {container.id.slice(0, 12)}
                          </div>
                        </div>
                      </button>
                    </td>
                    <td className="py-4 px-4 font-mono text-xs opacity-80">{container.image}</td>
                    <td className="py-4 px-4">
                      <Badge
                        variant={statusVariant(container.state)}
                        className="capitalize px-2 py-0.5 rounded-full"
                      >
                        {container.state}
                      </Badge>
                    </td>
                    <td className="py-4 px-4 text-xs font-mono text-muted-foreground">
                      {container.ports.join(', ') || 'n/a'}
                    </td>
                    <td className="py-4 px-4 text-muted-foreground whitespace-nowrap">
                      {relativeTime(container.createdAt)}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-wrap gap-1">
                        {container.networks.map((net) => (
                          <span
                            key={net}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-muted/40 border border-border/40"
                          >
                            {net}
                          </span>
                        )) || <span className="text-muted-foreground">n/a</span>}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2 text-xs"
                          disabled={isPending || container.state === 'running'}
                          onClick={() => onAction(container.id, 'start')}
                        >
                          Start
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2 text-xs"
                          disabled={isPending || container.state !== 'running'}
                          onClick={() => onAction(container.id, 'stop')}
                        >
                          Stop
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2 text-xs"
                          disabled={isPending}
                          onClick={() => onAction(container.id, 'restart')}
                        >
                          Restart
                        </Button>
                        <div className="w-px h-4 bg-border/40 mx-0.5" />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-xs hover:bg-primary/10 hover:text-primary transition-colors"
                          onClick={() => onLogs(container.id, container.name)}
                        >
                          Logs
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-xs hover:bg-primary/10 hover:text-primary transition-colors"
                          onClick={() => onExec(container.id, container.name)}
                        >
                          Exec
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 transition-transform active:rotate-12"
                          disabled={isPending}
                          onClick={() => onAction(container.id, 'remove')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="border-t border-border/40 bg-muted/10 animate-in fade-in duration-300">
                      <td colSpan={7} className="p-6">
                        <div className="grid gap-6 lg:grid-cols-3">
                          <div className="space-y-3">
                            <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                              <span className="w-1 h-1 rounded-full bg-primary" />
                              Live metrics
                            </h4>
                            <div className="rounded-xl border border-border/60 bg-background/50 p-4 space-y-2.5 shadow-inner">
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-muted-foreground">CPU usage</span>
                                <span className="font-mono font-bold">
                                  {container.cpuPercent.toFixed(1)}%
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-muted-foreground">Memory %</span>
                                <span className="font-mono font-bold">
                                  {container.memoryPercent.toFixed(1)}%
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-muted-foreground">Memory footprint</span>
                                <span className="font-mono">
                                  {formatBytes(container.memoryUsageBytes)} /{' '}
                                  {formatBytes(container.memoryLimitBytes)}
                                </span>
                              </div>
                              <div className="h-px bg-border/40 my-1" />
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-muted-foreground">Block reads</span>
                                <span className="font-mono">
                                  {formatBytes(container.blockReadBytes)}
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-muted-foreground">Block writes</span>
                                <span className="font-mono">
                                  {formatBytes(container.blockWriteBytes)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                              <span className="w-1 h-1 rounded-full bg-accent" />
                              Connectivity & mountpoints
                            </h4>
                            <div className="rounded-xl border border-border/60 bg-background/50 p-4 space-y-3.5 shadow-inner overflow-hidden">
                              <div>
                                <p className="text-[10px] font-semibold text-muted-foreground mb-1">
                                  Ports
                                </p>
                                <p className="text-xs font-mono truncate">
                                  {container.ports.join(', ') || 'No published ports'}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold text-muted-foreground mb-1">
                                  Networks
                                </p>
                                <p className="text-xs font-mono truncate">
                                  {container.networks.join(', ') || 'No networks'}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold text-muted-foreground mb-1">
                                  Volumes
                                </p>
                                <div className="text-[10px] font-mono leading-relaxed max-h-24 overflow-y-auto space-y-1">
                                  {container.mounts.length > 0
                                    ? container.mounts.map((mount) => (
                                        <div
                                          key={`${mount.source}-${mount.destination}`}
                                          className="bg-muted/40 p-1 rounded"
                                        >
                                          {mount.source}{' '}
                                          <span className="text-primary italic">→</span>{' '}
                                          {mount.destination}
                                        </div>
                                      ))
                                    : 'No mounts found'}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                              <span className="w-1 h-1 rounded-full bg-warning" />
                              Environment profile
                            </h4>
                            <div className="max-h-56 overflow-y-auto rounded-xl border border-border/60 bg-card p-3 font-mono text-[10px] text-muted-foreground shadow-inner custom-scrollbar">
                              {container.env.length > 0
                                ? container.env.map((entry) => (
                                    <div
                                      key={entry}
                                      className="py-1 border-b border-border/20 last:border-0 hover:bg-muted/40 transition-colors"
                                    >
                                      {entry}
                                    </div>
                                  ))
                                : 'No environment variables reported'}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
