'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Search,
  Cpu,
  MemoryStick,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  Skull,
  RefreshCw,
  User,
  Clock,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SkeletonCard, SkeletonTable } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface ProcessInfo {
  pid: number;
  parentPid: number;
  name: string;
  command: string;
  path: string;
  user: string;
  state: string;
  cpu: number;
  mem: number;
  memRss: number;
  started: string;
  priority: number;
}

interface Summary {
  total: number;
  running: number;
  sleeping: number;
  blocked: number;
  cpuLoad: number;
  memTotal: number;
  memUsed: number;
  memPercent: number;
}

type SortField = 'cpu' | 'mem' | 'pid' | 'name' | 'user';

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
    <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
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

function StatBoxBase({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-secondary/50 border border-border min-w-0">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-sm font-semibold text-foreground tabular-nums">{value}</p>
      </div>
    </div>
  );
}

const StatBox = React.memo(StatBoxBase);

interface SortHeaderProps {
  field: SortField;
  children: React.ReactNode;
  className?: string;
  currentSort: SortField;
  onSort: (field: SortField) => void;
}

const SortHeader = React.memo(({ field, children, className, currentSort, onSort }: SortHeaderProps) => (
  <th
    className={cn(
      'px-3 py-2.5 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none',
      className
    )}
    onClick={() => onSort(field)}
  >
    <span className="inline-flex items-center gap-1">
      {children}
      {currentSort === field && <ArrowUpDown className="w-3 h-3 text-primary" />}
    </span>
  </th>
));

SortHeader.displayName = 'SortHeader';

export default function ProcessWidget() {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('cpu');
  const [expandedPid, setExpandedPid] = useState<number | null>(null);
  const [killingPid, setKillingPid] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchProcs = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      try {
        const res = await fetch(
          `/api/modules/processes?limit=50&sort=${sortField}&search=${encodeURIComponent(
            debouncedSearch
          )}`
        );
        const data = await res.json();
        setProcesses(data.processes || []);
        if (data.summary) setSummary(data.summary);
      } catch {
        // silent fail on auto-refresh
      } finally {
        setLoading(false);
        if (isManual) setRefreshing(false);
      }
    },
    [sortField, debouncedSearch]
  );

  useEffect(() => {
    fetchProcs();
    const interval = setInterval(() => fetchProcs(), 5000);
    return () => clearInterval(interval);
  }, [fetchProcs]);

  const killProcess = async (pid: number, signal: string) => {
    setKillingPid(pid);
    try {
      const res = await fetch('/api/modules/processes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid, signal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: `Sent ${signal} to PID ${pid}`, variant: 'success' });
      setTimeout(() => fetchProcs(), 1000);
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : 'Failed to kill process',
        variant: 'destructive',
      });
    } finally {
      setKillingPid(null);
    }
  };

  const toggleSort = useCallback((field: SortField) => {
    setSortField(field);
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} data-testid={`skeleton-card-${i}`}>
              <SkeletonCard />
            </div>
          ))}
        </div>
        <SkeletonTable rows={8} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatBox
            label="Total"
            value={String(summary.total)}
            icon={<Activity className="w-4 h-4" />}
          />
          <StatBox
            label="Running"
            value={String(summary.running)}
            icon={<Cpu className="w-4 h-4" />}
          />
          <StatBox
            label="CPU Load"
            value={`${summary.cpuLoad.toFixed(1)}%`}
            icon={<Cpu className="w-4 h-4" />}
          />
          <StatBox
            label="Memory"
            value={`${summary.memPercent.toFixed(1)}%`}
            icon={<MemoryStick className="w-4 h-4" />}
          />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, PID, user..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchProcs(true)} className="gap-1.5">
          <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Mobile card layout */}
        <div className="sm:hidden divide-y divide-border">
          {processes.map((p) => (
            <div key={p.pid} className="p-3">
              <div className="flex items-start justify-between mb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-foreground truncate">{p.name}</span>
                    <Badge variant={stateVariant(p.state)} className="text-[10px]">
                      {p.state}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">PID {p.pid}</span>
                    <span>·</span>
                    <span>{p.user}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => setExpandedPid(expandedPid === p.pid ? null : p.pid)}
                >
                  {expandedPid === p.pid ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5">
                  <Cpu className="w-3 h-3 text-muted-foreground" />
                  <span className={cn('font-medium tabular-nums', cpuColor(p.cpu))}>
                    {p.cpu.toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MemoryStick className="w-3 h-3 text-muted-foreground" />
                  <span className="font-medium text-foreground tabular-nums">
                    {p.mem.toFixed(1)}%
                  </span>
                </div>
                {p.started && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{formatTime(p.started)}</span>
                  </div>
                )}
              </div>
              {expandedPid === p.pid && (
                <div className="mt-3 pt-3 border-t border-border space-y-2 text-xs animate-fade-in">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Command</span>
                    <span className="text-foreground font-mono truncate max-w-[60%] text-right">
                      {p.command}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">RSS Memory</span>
                    <span className="text-foreground">{formatBytes(p.memRss)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Parent PID</span>
                    <span className="text-foreground font-mono">{p.parentPid}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Priority</span>
                    <span className="text-foreground">{p.priority}</span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => killProcess(p.pid, 'SIGTERM')}
                      loading={killingPid === p.pid}
                    >
                      SIGTERM
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => killProcess(p.pid, 'SIGKILL')}
                      loading={killingPid === p.pid}
                    >
                      <Skull className="w-3 h-3" /> SIGKILL
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="w-8 px-2" />
                <SortHeader field="pid" currentSort={sortField} onSort={toggleSort}>
                  PID
                </SortHeader>
                <SortHeader field="name" currentSort={sortField} onSort={toggleSort}>
                  Process
                </SortHeader>
                <SortHeader field="user" currentSort={sortField} onSort={toggleSort}>
                  User
                </SortHeader>
                <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">State</th>
                <SortHeader
                  field="cpu"
                  className="text-right"
                  currentSort={sortField}
                  onSort={toggleSort}
                >
                  CPU
                </SortHeader>
                <SortHeader
                  field="mem"
                  className="text-right"
                  currentSort={sortField}
                  onSort={toggleSort}
                >
                  Memory
                </SortHeader>
                <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-right">
                  Uptime
                </th>
                <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-right w-20">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {processes.map((p) => (
                <React.Fragment key={p.pid}>
                  <tr className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors group">
                    <td className="px-2">
                      <button
                        className="p-1 rounded hover:bg-accent transition-colors cursor-pointer"
                        onClick={() => setExpandedPid(expandedPid === p.pid ? null : p.pid)}
                      >
                        {expandedPid === p.pid ? (
                          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
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
                          className={cn(
                            'text-xs font-medium tabular-nums w-12 text-right',
                            cpuColor(p.cpu)
                          )}
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
                        className="h-7 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                        onClick={() => killProcess(p.pid, 'SIGTERM')}
                        loading={killingPid === p.pid}
                      >
                        Kill
                      </Button>
                    </td>
                  </tr>
                  {expandedPid === p.pid && (
                    <tr className="bg-secondary/30">
                      <td colSpan={9} className="px-4 py-3">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs animate-fade-in">
                          <div>
                            <span className="text-muted-foreground">Command</span>
                            <p
                              className="font-mono text-foreground truncate mt-0.5"
                              title={p.command}
                            >
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
                              onClick={() => killProcess(p.pid, 'SIGTERM')}
                              loading={killingPid === p.pid}
                            >
                              SIGTERM
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="text-xs gap-1"
                              onClick={() => killProcess(p.pid, 'SIGKILL')}
                              loading={killingPid === p.pid}
                            >
                              <Skull className="w-3 h-3" /> Force Kill
                            </Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2.5 border-t border-border bg-secondary/30 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {processes.length} processes · sorted by {sortField}
          </span>
          <span className="text-xs text-muted-foreground">Auto-refreshes every 5s</span>
        </div>
      </div>
    </div>
  );
}
