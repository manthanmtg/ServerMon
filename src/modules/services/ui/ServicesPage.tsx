'use client';

import { Fragment, useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Cog,
  LoaderCircle,
  Pause,
  Play,
  Power,
  RefreshCcw,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  Square,
  Timer,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageSkeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { cn, formatBytes } from '@/lib/utils';
import type { ServiceLogEntry, ServicesSnapshot } from '../types';

type FilterStatus = 'all' | 'running' | 'failed' | 'inactive' | 'exited';
type SortField = 'name' | 'status' | 'cpu' | 'memory' | 'uptime' | 'restarts';
type SortDir = 'asc' | 'desc';
type ViewTab = 'services' | 'timers' | 'alerts';

const chartColors = [
  'var(--primary)',
  'var(--accent)',
  'var(--success)',
  'var(--warning)',
  'var(--destructive)',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
];

function formatUptime(seconds: number): string {
  if (seconds <= 0) return '-';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function relativeTime(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.round(diff / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function futureTime(value: string): string {
  const diff = new Date(value).getTime() - Date.now();
  if (diff < 0) return 'overdue';
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)}d`;
}

function statusVariant(state: string): 'success' | 'warning' | 'destructive' | 'secondary' {
  if (state === 'active') return 'success';
  if (state === 'activating' || state === 'deactivating' || state === 'reloading') return 'warning';
  if (state === 'failed') return 'destructive';
  return 'secondary';
}

function subStateIcon(sub: string) {
  if (sub === 'running') return <Play className="w-3.5 h-3.5" />;
  if (sub === 'exited') return <Square className="w-3.5 h-3.5" />;
  if (sub === 'failed') return <XCircle className="w-3.5 h-3.5" />;
  if (sub === 'dead') return <Power className="w-3.5 h-3.5" />;
  if (sub === 'waiting' || sub === 'start-pre' || sub === 'start')
    return <LoaderCircle className="w-3.5 h-3.5 animate-spin" />;
  if (sub === 'auto-restart') return <RotateCcw className="w-3.5 h-3.5 animate-spin" />;
  return <Pause className="w-3.5 h-3.5" />;
}

function healthScoreColor(score: number): string {
  if (score >= 90) return 'text-success';
  if (score >= 70) return 'text-warning';
  return 'text-destructive';
}

function logPriorityVariant(priority: string): 'destructive' | 'warning' | 'default' | 'secondary' {
  if (priority === 'emerg' || priority === 'alert' || priority === 'crit' || priority === 'err')
    return 'destructive';
  if (priority === 'warning') return 'warning';
  if (priority === 'notice') return 'default';
  return 'secondary';
}

function HealthGauge({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="relative w-32 h-32">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="54" fill="none" stroke="var(--border)" strokeWidth="8" />
        <circle
          cx="60"
          cy="60"
          r="54"
          fill="none"
          stroke={
            score >= 90 ? 'var(--success)' : score >= 70 ? 'var(--warning)' : 'var(--destructive)'
          }
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('text-2xl font-bold', healthScoreColor(score))}>{score}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Health</span>
      </div>
    </div>
  );
}

function ServiceLogPanel({ serviceName }: { serviceName: string }) {
  const [logs, setLogs] = useState<ServiceLogEntry[] | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/modules/services/${encodeURIComponent(serviceName)}/logs?lines=30`, {
      cache: 'no-store',
    })
      .then((r) => r.json())
      .then((data) => {
        if (active) setLogs(data.logs || []);
      })
      .catch(() => {
        if (active) setLogs([]);
      });
    return () => {
      active = false;
    };
  }, [serviceName]);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const loading = logs === null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!loading && logs.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">No logs available.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Activity className="w-3 h-3" /> Recent logs
        </p>
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border',
            autoScroll
              ? 'bg-primary/10 text-primary border-primary/20'
              : 'bg-muted/50 text-muted-foreground border-border/60 hover:bg-muted'
          )}
        >
          <RotateCcw
            className={cn('w-3 h-3 transition-transform', autoScroll && 'animate-spin-slow')}
          />
          {autoScroll ? 'Autoscroll: ON' : 'Autoscroll: OFF'}
        </button>
      </div>
      <div
        ref={logContainerRef}
        className="max-h-[240px] overflow-y-auto space-y-1 font-mono text-xs custom-scrollbar scroll-smooth p-2 rounded-xl bg-black/20 border border-border/40"
      >
        {logs.map((entry, i) => (
          <div key={i} className="flex items-start gap-2 py-0.5">
            <Badge
              variant={logPriorityVariant(entry.priority)}
              className="shrink-0 text-[10px] px-1.5 py-0 min-w-[48px] justify-center"
            >
              {entry.priority}
            </Badge>
            <span className="text-muted-foreground shrink-0 w-[140px]">
              {new Date(entry.timestamp).toLocaleString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                month: 'short',
                day: 'numeric',
              })}
            </span>
            <span className="text-foreground break-all">{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ServicesPage() {
  const { toast } = useToast();
  const [snapshot, setSnapshot] = useState<ServicesSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshMs, setRefreshMs] = useState(5000);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expandedService, setExpandedService] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<ViewTab>('services');

  const loadSnapshot = useCallback(async () => {
    const response = await fetch('/api/modules/services', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch services data');
    }
    setSnapshot(data);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadSnapshot()
      .catch((error: unknown) => {
        if (active) {
          toast({
            title: 'Services snapshot failed',
            description: error instanceof Error ? error.message : 'Unknown error',
            variant: 'destructive',
          });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const interval = window.setInterval(() => {
      loadSnapshot().catch(() => {});
    }, refreshMs);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [loadSnapshot, refreshMs, toast]);

  const filteredServices = useMemo(() => {
    if (!snapshot) return [];
    let list = snapshot.services;

    if (filter !== 'all') {
      list = list.filter((s) => {
        if (filter === 'running') return s.subState === 'running';
        if (filter === 'failed') return s.activeState === 'failed';
        if (filter === 'inactive') return s.activeState === 'inactive';
        if (filter === 'exited') return s.subState === 'exited';
        return true;
      });
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      );
    }

    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'status':
          cmp = a.activeState.localeCompare(b.activeState);
          break;
        case 'cpu':
          cmp = a.cpuPercent - b.cpuPercent;
          break;
        case 'memory':
          cmp = a.memoryBytes - b.memoryBytes;
          break;
        case 'uptime':
          cmp = a.uptimeSeconds - b.uptimeSeconds;
          break;
        case 'restarts':
          cmp = a.restartCount - b.restartCount;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [snapshot, filter, search, sortField, sortDir]);

  const topByCpu = useMemo(() => {
    if (!snapshot) return [];
    return [...snapshot.services]
      .filter((s) => s.cpuPercent > 0)
      .sort((a, b) => b.cpuPercent - a.cpuPercent)
      .slice(0, 10);
  }, [snapshot]);

  const topByMemory = useMemo(() => {
    if (!snapshot) return [];
    return [...snapshot.services]
      .filter((s) => s.memoryBytes > 0)
      .sort((a, b) => b.memoryBytes - a.memoryBytes)
      .slice(0, 10);
  }, [snapshot]);

  const stateDistribution = useMemo(() => {
    if (!snapshot) return [];
    return [
      { name: 'Running', value: snapshot.summary.running, fill: 'var(--success)' },
      { name: 'Exited', value: snapshot.summary.exited, fill: 'var(--muted-foreground)' },
      { name: 'Failed', value: snapshot.summary.failed, fill: 'var(--destructive)' },
      { name: 'Inactive', value: snapshot.summary.inactive, fill: 'var(--warning)' },
    ].filter((d) => d.value > 0);
  }, [snapshot]);

  const cpuHistory = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.history.map((h) => {
      const row: Record<string, number | string> = {
        time: new Date(h.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      };
      h.services.forEach((s, i) => {
        if (i < 5) {
          row[`cpu${i}`] = s.cpuPercent;
          row[`name${i}`] = s.name;
        }
      });
      return row;
    });
  }, [snapshot]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'name' ? 'asc' : 'desc');
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-muted-foreground/50" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  }

  async function runAction(
    serviceName: string,
    action: 'start' | 'stop' | 'restart' | 'enable' | 'disable' | 'reload'
  ) {
    setPendingAction(`${serviceName}:${action}`);
    try {
      const response = await fetch(
        `/api/modules/services/${encodeURIComponent(serviceName)}/action`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to execute action');
      }
      toast({ title: `${action} ${serviceName}`, description: data.message, variant: 'success' });
      await loadSnapshot();
    } catch (error: unknown) {
      toast({
        title: `${action} failed`,
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setPendingAction(null);
    }
  }

  if (loading) {
    return <PageSkeleton statCards={3} />;
  }

  return (
    <div className="space-y-6" data-testid="services-page">
      {/* Hero header */}
      <section className="rounded-[28px] border border-border/60 bg-[radial-gradient(circle_at_top_left,var(--primary)/0.18,transparent_40%),linear-gradient(180deg,var(--card),color-mix(in_oklab,var(--card)_92%,transparent))] p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={snapshot?.systemdAvailable ? 'success' : 'warning'}>
                {snapshot?.systemdAvailable ? 'systemd connected' : 'Mock mode'}
              </Badge>
              <Badge variant="outline">Source: {snapshot?.source || 'unknown'}</Badge>
              {(snapshot?.summary.failed ?? 0) > 0 && (
                <Badge variant="destructive">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {snapshot?.summary.failed} failed
                </Badge>
              )}
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Services operations center
              </h2>
              <p className="text-sm text-muted-foreground">
                Live service monitoring, resource tracking, health scores, and management controls.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex min-h-[44px] flex-col justify-center rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Filter
              <select
                className="mt-1 bg-transparent text-sm font-semibold text-foreground outline-none"
                value={filter}
                onChange={(e) => setFilter(e.target.value as FilterStatus)}
              >
                <option value="all">All services</option>
                <option value="running">Running</option>
                <option value="failed">Failed</option>
                <option value="inactive">Inactive</option>
                <option value="exited">Exited</option>
              </select>
            </label>
            <label className="flex min-h-[44px] flex-col justify-center rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Refresh
              <select
                className="mt-1 bg-transparent text-sm font-semibold text-foreground outline-none"
                value={String(refreshMs)}
                onChange={(e) => setRefreshMs(Number(e.target.value))}
              >
                <option value="3000">3 sec</option>
                <option value="5000">5 sec</option>
                <option value="10000">10 sec</option>
                <option value="30000">30 sec</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => loadSnapshot().catch(() => undefined)}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh now
            </button>
          </div>
        </div>
      </section>

      {/* Summary cards + Health gauge */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="border-border/60 bg-card/80 sm:col-span-2 lg:col-span-1 lg:row-span-2">
          <CardContent className="flex flex-col items-center justify-center p-5 min-h-[180px]">
            <HealthGauge score={snapshot?.summary.healthScore ?? 0} />
            <p className="mt-2 text-xs text-muted-foreground uppercase tracking-wider">
              System Health
            </p>
          </CardContent>
        </Card>
        {[
          {
            label: 'Running',
            value: snapshot?.summary.running ?? 0,
            icon: Play,
            color: 'text-success',
          },
          {
            label: 'Failed',
            value: snapshot?.summary.failed ?? 0,
            icon: XCircle,
            color: 'text-destructive',
          },
          {
            label: 'Inactive',
            value: snapshot?.summary.inactive ?? 0,
            icon: Power,
            color: 'text-warning',
          },
          { label: 'Total', value: snapshot?.summary.total ?? 0, icon: Cog, color: 'text-primary' },
          {
            label: 'Enabled',
            value: snapshot?.summary.enabled ?? 0,
            icon: CheckCircle,
            color: 'text-success',
          },
          {
            label: 'Disabled',
            value: snapshot?.summary.disabled ?? 0,
            icon: Shield,
            color: 'text-muted-foreground',
          },
          {
            label: 'Exited',
            value: snapshot?.summary.exited ?? 0,
            icon: Square,
            color: 'text-muted-foreground',
          },
          {
            label: 'Alerts',
            value: snapshot?.alerts.length ?? 0,
            icon: ShieldAlert,
            color:
              (snapshot?.alerts.length ?? 0) > 0 ? 'text-destructive' : 'text-muted-foreground',
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border-border/60 bg-card/80">
            <CardContent className="flex items-center justify-between p-4 min-h-[80px]">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  {label}
                </p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/30 p-2.5">
                <Icon className={cn('h-5 w-5', color)} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="border-border/60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Top services by CPU</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Horizontal bar chart of the busiest services.
                </p>
              </div>
              <Badge variant="outline">Top 10</Badge>
            </div>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topByCpu} layout="vertical">
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={120}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                />
                <Tooltip
                  formatter={(value: unknown) => [
                    `${(typeof value === 'number' ? value : Number(value || 0)).toFixed(2)}%`,
                    'CPU',
                  ]}
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                />
                <Bar
                  dataKey="cpuPercent"
                  fill="var(--primary)"
                  radius={[0, 6, 6, 0]}
                  name="CPU %"
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Top services by memory</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Memory consumption of the heaviest services.
                </p>
              </div>
              <Badge variant="outline">Top 10</Badge>
            </div>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topByMemory} layout="vertical">
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                  tickFormatter={(v: number) => formatBytes(v)}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={120}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                />
                <Tooltip
                  formatter={(value: unknown) => [
                    formatBytes(typeof value === 'number' ? value : Number(value || 0)),
                    'Memory',
                  ]}
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                />
                <Bar
                  dataKey="memoryBytes"
                  fill="var(--accent)"
                  radius={[0, 6, 6, 0]}
                  name="Memory"
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* State distribution + CPU history */}
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Service state distribution</CardTitle>
            <p className="text-sm text-muted-foreground">Breakdown of services by active state.</p>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stateDistribution}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={3}
                >
                  {stateDistribution.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>CPU usage over time</CardTitle>
            <p className="text-sm text-muted-foreground">
              Tracking the top 5 CPU-consuming services.
            </p>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cpuHistory}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                />
                {[0, 1, 2, 3, 4].map((i) => (
                  <Line
                    key={i}
                    type="monotone"
                    dataKey={`cpu${i}`}
                    stroke={chartColors[i]}
                    strokeWidth={2}
                    dot={false}
                    name={
                      (cpuHistory[cpuHistory.length - 1]?.[`name${i}`] as string) ||
                      `Service ${i + 1}`
                    }
                  />
                ))}
                <Legend />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="inline-flex rounded-xl border border-border bg-muted/30 p-1">
          {(['services', 'timers', 'alerts'] as ViewTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setViewTab(tab)}
              className={cn(
                'min-h-[44px] rounded-lg px-4 text-xs font-semibold uppercase tracking-[0.18em] transition-colors flex items-center gap-2',
                viewTab === tab
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab === 'services' && <Cog className="w-3.5 h-3.5" />}
              {tab === 'timers' && <Timer className="w-3.5 h-3.5" />}
              {tab === 'alerts' && <AlertTriangle className="w-3.5 h-3.5" />}
              {tab}
              {tab === 'alerts' && (snapshot?.alerts.length ?? 0) > 0 && (
                <span className="ml-1 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
                  {snapshot?.alerts.length}
                </span>
              )}
            </button>
          ))}
        </div>
        {viewTab === 'services' && (
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search services..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        )}
      </div>

      {/* Services table */}
      {viewTab === 'services' && (
        <Card className="border-border/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-[0.18em] text-muted-foreground bg-muted/20">
                <tr>
                  <th className="py-3 px-4 w-8" />
                  <th
                    className="py-3 px-4 cursor-pointer select-none"
                    onClick={() => toggleSort('name')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Service <SortIcon field="name" />
                    </span>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer select-none"
                    onClick={() => toggleSort('status')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Status <SortIcon field="status" />
                    </span>
                  </th>
                  <th className="py-3 px-4">PID</th>
                  <th
                    className="py-3 px-4 cursor-pointer select-none"
                    onClick={() => toggleSort('cpu')}
                  >
                    <span className="inline-flex items-center gap-1">
                      CPU <SortIcon field="cpu" />
                    </span>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer select-none"
                    onClick={() => toggleSort('memory')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Memory <SortIcon field="memory" />
                    </span>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer select-none"
                    onClick={() => toggleSort('uptime')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Uptime <SortIcon field="uptime" />
                    </span>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer select-none"
                    onClick={() => toggleSort('restarts')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Restarts <SortIcon field="restarts" />
                    </span>
                  </th>
                  <th className="py-3 px-4">Enabled</th>
                  <th className="py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredServices.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-muted-foreground">
                      No services match your filter.
                    </td>
                  </tr>
                ) : (
                  filteredServices.map((svc) => {
                    const isExpanded = expandedService === svc.name;
                    return (
                      <Fragment key={svc.name}>
                        <tr
                          className={cn(
                            'border-t border-border/60 transition-colors hover:bg-muted/10',
                            isExpanded && 'bg-muted/10'
                          )}
                        >
                          <td className="py-3 px-4">
                            <button
                              type="button"
                              onClick={() => setExpandedService(isExpanded ? null : svc.name)}
                              className="p-1 rounded hover:bg-accent transition-colors"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                              )}
                            </button>
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              <span className="font-medium">{svc.name}</span>
                              <p className="text-xs text-muted-foreground truncate max-w-[250px]">
                                {svc.description}
                              </p>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant={statusVariant(svc.activeState)} className="gap-1">
                              {subStateIcon(svc.subState)}
                              {svc.activeState} ({svc.subState})
                            </Badge>
                          </td>
                          <td className="py-3 px-4 font-mono text-xs">
                            {svc.mainPid > 0 ? svc.mainPid : '-'}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={cn(
                                'font-medium',
                                svc.cpuPercent > 50
                                  ? 'text-destructive'
                                  : svc.cpuPercent > 20
                                    ? 'text-warning'
                                    : ''
                              )}
                            >
                              {svc.cpuPercent > 0 ? `${svc.cpuPercent.toFixed(1)}%` : '-'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={cn(
                                'font-medium',
                                svc.memoryBytes > 2 * 1024 * 1024 * 1024
                                  ? 'text-destructive'
                                  : svc.memoryBytes > 512 * 1024 * 1024
                                    ? 'text-warning'
                                    : ''
                              )}
                            >
                              {svc.memoryBytes > 0 ? formatBytes(svc.memoryBytes) : '-'}
                            </span>
                            {svc.memoryPercent > 0 && (
                              <span className="text-xs text-muted-foreground ml-1">
                                ({svc.memoryPercent}%)
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs">{formatUptime(svc.uptimeSeconds)}</td>
                          <td className="py-3 px-4">
                            {svc.restartCount > 0 ? (
                              <Badge variant={svc.restartCount > 3 ? 'destructive' : 'warning'}>
                                {svc.restartCount}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant={svc.enabled ? 'success' : 'secondary'}>
                              {svc.enabled ? 'yes' : 'no'}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1">
                              {svc.activeState !== 'active' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 text-success hover:bg-success/10"
                                  title="Start"
                                  loading={pendingAction === `${svc.name}:start`}
                                  onClick={() => runAction(svc.name, 'start')}
                                >
                                  <Play className="h-4 w-4" />
                                </Button>
                              )}
                              {svc.activeState === 'active' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                                  title="Stop"
                                  loading={pendingAction === `${svc.name}:stop`}
                                  onClick={() => runAction(svc.name, 'stop')}
                                >
                                  <Square className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-primary hover:bg-primary/10"
                                title="Restart"
                                loading={pendingAction === `${svc.name}:restart`}
                                onClick={() => runAction(svc.name, 'restart')}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 hover:bg-accent"
                                title={svc.enabled ? 'Disable' : 'Enable'}
                                loading={
                                  pendingAction === `${svc.name}:enable` ||
                                  pendingAction === `${svc.name}:disable`
                                }
                                onClick={() =>
                                  runAction(svc.name, svc.enabled ? 'disable' : 'enable')
                                }
                              >
                                {svc.enabled ? (
                                  <Shield className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <CheckCircle className="h-4 w-4 text-success" />
                                )}
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-muted/5">
                            <td colSpan={10} className="px-4 py-3">
                              <div className="space-y-3">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                  <div>
                                    <span className="text-muted-foreground">Type: </span>
                                    <span className="font-medium">{svc.type}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Unit file: </span>
                                    <span className="font-mono">{svc.unitFileState}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Path: </span>
                                    <span className="font-mono truncate">
                                      {svc.fragmentPath || 'n/a'}
                                    </span>
                                  </div>
                                  {svc.triggeredBy && (
                                    <div>
                                      <span className="text-muted-foreground">Triggered by: </span>
                                      <span className="font-medium">{svc.triggeredBy}</span>
                                    </div>
                                  )}
                                </div>
                                {svc.after && svc.after.length > 0 && (
                                  <div className="text-xs">
                                    <span className="text-muted-foreground">
                                      Dependencies (After):{' '}
                                    </span>
                                    <span className="font-mono">
                                      {svc.after.slice(0, 8).join(', ')}
                                      {svc.after.length > 8 && ` +${svc.after.length - 8} more`}
                                    </span>
                                  </div>
                                )}
                                <div>
                                <ServiceLogPanel serviceName={svc.name} />
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border/60 text-xs text-muted-foreground">
            Showing {filteredServices.length} of {snapshot?.summary.total ?? 0} services
          </div>
        </Card>
      )}

      {/* Timers tab */}
      {viewTab === 'timers' && (
        <Card className="border-border/60 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Timer className="w-4 h-4" />
              Systemd Timers
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Scheduled timer units and their next/last execution times.
            </p>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-[0.18em] text-muted-foreground bg-muted/20">
                <tr>
                  <th className="py-3 px-5">Timer</th>
                  <th className="py-3 px-5">Activates</th>
                  <th className="py-3 px-5">Next Run</th>
                  <th className="py-3 px-5">Last Run</th>
                </tr>
              </thead>
              <tbody>
                {!snapshot?.timers || snapshot.timers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-muted-foreground">
                      No timers found.
                    </td>
                  </tr>
                ) : (
                  snapshot.timers.map((timer) => (
                    <tr key={timer.name} className="border-t border-border/60">
                      <td className="py-3 px-5 font-medium">{timer.name}</td>
                      <td className="py-3 px-5 font-mono text-xs text-muted-foreground">
                        {timer.activates}
                      </td>
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs">{futureTime(timer.nextRun)}</span>
                        </div>
                      </td>
                      <td className="py-3 px-5 text-xs text-muted-foreground">
                        {relativeTime(timer.lastRun)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Alerts tab */}
      {viewTab === 'alerts' && (
        <Card className="border-border/60 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Active Alerts
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Service alerts based on failure detection, restart loops, and resource thresholds.
            </p>
          </CardHeader>
          <div className="overflow-x-auto">
            {!snapshot?.alerts || snapshot.alerts.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground flex flex-col items-center gap-2">
                <CheckCircle className="w-8 h-8 text-success" />
                <p>No active alerts. All services are healthy.</p>
              </div>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-[0.18em] text-muted-foreground bg-muted/20">
                  <tr>
                    <th className="py-3 px-5">Severity</th>
                    <th className="py-3 px-5">Service</th>
                    <th className="py-3 px-5">Alert</th>
                    <th className="py-3 px-5">First Seen</th>
                    <th className="py-3 px-5">Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.alerts.map((alert) => (
                    <tr key={alert.id} className="border-t border-border/60">
                      <td className="py-3 px-5">
                        <Badge variant={alert.severity === 'critical' ? 'destructive' : 'warning'}>
                          {alert.severity}
                        </Badge>
                      </td>
                      <td className="py-3 px-5 font-medium">{alert.service}</td>
                      <td className="py-3 px-5">
                        <div>
                          <p className="font-medium">{alert.title}</p>
                          <p className="text-xs text-muted-foreground">{alert.message}</p>
                        </div>
                      </td>
                      <td className="py-3 px-5 text-xs text-muted-foreground">
                        {relativeTime(alert.firstSeenAt)}
                      </td>
                      <td className="py-3 px-5 text-xs text-muted-foreground">
                        {relativeTime(alert.lastSeenAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
