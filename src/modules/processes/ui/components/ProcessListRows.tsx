import React from 'react';
import { ChevronRight, Clock, Cpu, MemoryStick, Skull, User } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ProcessInfo } from '../types';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatTime(started: string): string {
  if (!started) return '—';
  const d = new Date(started);
  if (isNaN(d.getTime())) return '—';
  const now = Date.now();
  const diffMs = now - d.getTime();
  if (diffMs < 0) return '—';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function stateVariant(state: string): 'success' | 'secondary' | 'warning' | 'destructive' {
  switch (state) {
    case 'running':
      return 'success';
    case 'sleeping':
      return 'secondary';
    case 'stopped':
      return 'warning';
    case 'zombie':
      return 'destructive';
    default:
      return 'secondary';
  }
}

function cpuColor(cpu: number): string {
  if (cpu > 50) return 'text-destructive';
  if (cpu > 20) return 'text-warning';
  return 'text-foreground';
}

function CpuBarBase({ value }: { value: number }) {
  return (
    <div
      className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="CPU Usage"
    >
      <div
        className={cn(
          'h-full rounded-full transition-all',
          value > 50 ? 'bg-destructive' : value > 20 ? 'bg-warning' : 'bg-primary'
        )}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

const CpuBar = React.memo(CpuBarBase);

export interface ProcessItemProps {
  process: ProcessInfo;
  isExpanded: boolean;
  isKilling: boolean;
  onToggleExpand: (pid: number) => void;
  onKill: (pid: number, signal: string) => void;
}

export const ProcessCard = React.memo(
  ({ process: p, isExpanded, isKilling, onToggleExpand, onKill }: ProcessItemProps) => (
    <motion.div layout className="p-3" role="listitem" aria-label={`${p.name} process summary`}>
      <div
        className="flex items-start justify-between mb-2 cursor-pointer group/card-header select-none"
        onClick={() => onToggleExpand(p.pid)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleExpand(p.pid);
          }
        }}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for process ${p.name} (${p.pid})`}
        aria-expanded={isExpanded}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-foreground truncate">{p.name}</span>
            <Badge variant={stateVariant(p.state)} className="text-[10px] py-0 h-4 px-1.5">
              {p.state}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono bg-secondary/50 px-1 rounded text-[10px]">PID {p.pid}</span>
            <span>·</span>
            <span>{p.user}</span>
          </div>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 90 : 0 }}
          className="flex items-center justify-center h-9 w-9 -mr-1.5 -mt-1 rounded-full group-hover/card-header:bg-accent/50 transition-colors text-muted-foreground group-hover/card-header:text-foreground"
          aria-hidden="true"
        >
          <ChevronRight className="w-5 h-5" />
        </motion.div>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5" title="CPU Usage">
          <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
          <span className={cn('font-medium tabular-nums', cpuColor(p.cpu))}>
            {p.cpu.toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center gap-1.5" title="Memory Usage">
          <MemoryStick className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-medium text-foreground tabular-nums">{p.mem.toFixed(1)}%</span>
        </div>
        {p.started && (
          <div className="flex items-center gap-1.5" title="Uptime">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{formatTime(p.started)}</span>
          </div>
        )}
      </div>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-border space-y-2.5 text-xs">
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground">Command</span>
                <div className="text-foreground font-mono break-all bg-secondary/30 p-2 rounded border border-border/50 leading-relaxed">
                  {p.command}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">RSS Memory</span>
                  <span className="text-foreground font-medium">{formatBytes(p.memRss)}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">Parent PID</span>
                  <span className="text-foreground font-mono">{p.parentPid}</span>
                </div>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground">Priority</span>
                <span className="text-foreground bg-secondary/50 px-2 py-0.5 rounded-full font-medium">
                  {p.priority}
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                <Button
                  variant="outline"
                  size="default"
                  className="min-h-11 flex-1 text-xs"
                  onClick={() => onKill(p.pid, 'SIGTERM')}
                  loading={isKilling}
                  aria-label={`Send SIGTERM to process ${p.name} (${p.pid})`}
                >
                  SIGTERM
                </Button>
                <Button
                  variant="destructive"
                  size="default"
                  className="min-h-11 flex-1 text-xs"
                  onClick={() => onKill(p.pid, 'SIGKILL')}
                  loading={isKilling}
                  aria-label={`Send SIGKILL to process ${p.name} (${p.pid})`}
                >
                  <Skull className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> SIGKILL
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  ),
  (prev, next) => {
    if (prev.isExpanded !== next.isExpanded || prev.isKilling !== next.isKilling) return false;
    if (prev.onToggleExpand !== next.onToggleExpand || prev.onKill !== next.onKill) return false;

    const p = prev.process;
    const n = next.process;

    if (p.pid !== n.pid || p.state !== n.state || p.name !== n.name || p.user !== n.user)
      return false;
    if (p.cpu !== n.cpu || p.mem !== n.mem || p.started !== n.started) return false;

    if (next.isExpanded) {
      if (
        p.command !== n.command ||
        p.memRss !== n.memRss ||
        p.parentPid !== n.parentPid ||
        p.priority !== n.priority
      )
        return false;
    }

    return true;
  }
);

ProcessCard.displayName = 'ProcessCard';

export const ProcessRow = React.memo(
  ({ process: p, isExpanded, isKilling, onToggleExpand, onKill }: ProcessItemProps) => (
    <React.Fragment>
      <tr className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors group">
        <td className="px-2">
          <button
            type="button"
            className="p-1 rounded hover:bg-accent transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            onClick={() => onToggleExpand(p.pid)}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for process ${p.name} (${
              p.pid
            })`}
            aria-expanded={isExpanded}
          >
            <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            </motion.div>
          </button>
        </td>
        <td className="px-3 py-2.5">
          <span className="text-xs font-mono text-muted-foreground">{p.pid}</span>
        </td>
        <td className="px-3 py-2.5">
          <span
            className="text-sm font-medium text-foreground truncate block max-w-[200px]"
            title={p.name}
          >
            {p.name}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <User className="w-3 h-3" />
            {p.user}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <Badge variant={stateVariant(p.state)} className="text-[10px]">
            {p.state}
          </Badge>
        </td>
        <td className="px-3 py-2.5 text-right">
          <div className="flex items-center justify-end gap-2">
            <CpuBar value={p.cpu} />
            <span
              className={cn('text-xs font-medium tabular-nums w-12 text-right', cpuColor(p.cpu))}
            >
              {p.cpu.toFixed(1)}%
            </span>
          </div>
        </td>
        <td className="px-3 py-2.5 text-right">
          <span className="text-xs font-medium text-foreground tabular-nums">
            {p.mem.toFixed(1)}%
          </span>
        </td>
        <td className="px-3 py-2.5 text-right">
          <span className="text-xs text-muted-foreground">{formatTime(p.started)}</span>
        </td>
        <td className="px-3 py-2.5 text-right">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-destructive hover:text-destructive"
            onClick={() => onKill(p.pid, 'SIGTERM')}
            loading={isKilling}
            aria-label={`Send SIGTERM to process ${p.name} (${p.pid})`}
          >
            Kill
          </Button>
        </td>
      </tr>
      <AnimatePresence>
        {isExpanded && (
          <tr className="bg-secondary/30">
            <td colSpan={9} className="p-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="px-4 py-3 grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Command</span>
                    <p className="font-mono text-foreground truncate mt-0.5" title={p.command}>
                      {p.command}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Path</span>
                    <p className="font-mono text-foreground truncate mt-0.5" title={p.path}>
                      {p.path || '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">RSS Memory</span>
                    <p className="text-foreground mt-0.5">{formatBytes(p.memRss)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Parent PID</span>
                    <p className="font-mono text-foreground mt-0.5">{p.parentPid}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Priority</span>
                    <p className="text-foreground mt-0.5">{p.priority}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Started</span>
                    <p className="text-foreground mt-0.5">
                      {p.started ? new Date(p.started).toLocaleString() : '—'}
                    </p>
                  </div>
                  <div className="lg:col-span-2 flex items-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => onKill(p.pid, 'SIGTERM')}
                      loading={isKilling}
                      aria-label={`Send SIGTERM to process ${p.name} (${p.pid})`}
                    >
                      SIGTERM
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="text-xs gap-1"
                      onClick={() => onKill(p.pid, 'SIGKILL')}
                      loading={isKilling}
                      aria-label={`Send SIGKILL to process ${p.name} (${p.pid})`}
                    >
                      <Skull className="w-3 h-3" aria-hidden="true" /> Force Kill
                    </Button>
                  </div>
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </React.Fragment>
  ),
  (prev, next) => {
    if (prev.isExpanded !== next.isExpanded || prev.isKilling !== next.isKilling) return false;
    if (prev.onToggleExpand !== next.onToggleExpand || prev.onKill !== next.onKill) return false;

    const p = prev.process;
    const n = next.process;

    if (p.pid !== n.pid || p.name !== n.name || p.user !== n.user || p.state !== n.state)
      return false;
    if (p.cpu !== n.cpu || p.mem !== n.mem || p.started !== n.started) return false;

    if (next.isExpanded) {
      if (
        p.command !== n.command ||
        p.path !== n.path ||
        p.memRss !== n.memRss ||
        p.parentPid !== n.parentPid ||
        p.priority !== n.priority
      )
        return false;
    }

    return true;
  }
);

ProcessRow.displayName = 'ProcessRow';
