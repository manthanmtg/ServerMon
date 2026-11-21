'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  ExternalLink,
  Gauge,
  History,
  Loader2,
  RefreshCcw,
  Shield,
  TerminalSquare,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { resilientFetch, safeJson } from '@/lib/fetch-utils';
import { cn, formatBytes } from '@/lib/utils';
import type {
  NetworkSnapshot,
  NetworkSpeedtestOverview,
  NetworkSpeedtestScheduleInterval,
} from '../types';
import TerminalUI from '@/modules/terminal/ui/TerminalUI';
import { SpeedtestHistoryModal } from './components/SpeedtestHistoryModal';
import { NetworkAlerts } from './components/NetworkAlerts';
import { QuickInsights } from './components/QuickInsights';

const chartColors = [
  'var(--primary)',
  'var(--accent)',
  'var(--success)',
  'var(--warning)',
  'var(--destructive)',
];

function formatSpeed(bps: number) {
  if (bps >= 1000) return `${(bps / 1000).toFixed(1)} Gbps`;
  return `${bps} Mbps`;
}

function tooltipBytes(value: unknown) {
  return formatBytes(typeof value === 'number' ? value : Number(value) || 0);
}

function formatMbps(value: number | undefined) {
  return typeof value === 'number' ? `${value.toFixed(2)} Mbps` : '-';
}

function formatLatency(value: number | undefined) {
  return typeof value === 'number' ? `${value.toFixed(2)} ms` : '-';
}

function formatSpeedtestDate(value: string | undefined) {
  if (!value) return '-';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getSafeHttpUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

const scheduleOptions: Array<{ value: NetworkSpeedtestScheduleInterval; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: '30m', label: 'Every 30 min' },
  { value: '1h', label: 'Every hour' },
  { value: '3h', label: 'Every 3 hours' },
  { value: '6h', label: 'Every 6 hours' },
  { value: '24h', label: 'Every day' },
];

const NETWORK_REQUEST_TIMEOUT_MS = 5000;
const SPEEDTEST_OVERVIEW_TIMEOUT_MS = 8000;
const TRANSIENT_RETRY_STATUSES = [502, 503, 504];
const SPEEDTEST_RUN_TIMEOUT_MS = 20000;

type SpeedtestRunResponse = {
  status?: string;
  error?: string;
  downloadMbps?: number;
  uploadMbps?: number;
  pingMs?: number;
};

type ApiErrorPayload = {
  error?: string;
};

export default function NetworkPage() {
  const { toast } = useToast();
  const [snapshot, setSnapshot] = useState<NetworkSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshMs, setRefreshMs] = useState(5000);
  const [selectedIface, setSelectedIface] = useState<string>('all');
  const [sessionId] = useState(() => `network-${crypto.randomUUID()}`);
  const [terminalCommand, setTerminalCommand] = useState('ip addr\n');
  const [speedtestOverview, setSpeedtestOverview] = useState<NetworkSpeedtestOverview | null>(null);
  const [speedtestLoading, setSpeedtestLoading] = useState(false);
  const [speedtestRunning, setSpeedtestRunning] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [showSpeedtestHistory, setShowSpeedtestHistory] = useState(false);

  const loadSnapshot = useCallback(async () => {
    const response = await resilientFetch('/api/modules/network', {
      cache: 'no-store',
      timeout: NETWORK_REQUEST_TIMEOUT_MS,
      retries: 1,
      retryDelay: 300,
      retryOnStatuses: TRANSIENT_RETRY_STATUSES,
    });
    const data = await safeJson<(NetworkSnapshot & ApiErrorPayload) | ApiErrorPayload>(response);
    if (!response.ok) {
      throw new Error(data?.error || 'Failed to fetch network data');
    }
    if (!data || !('interfaces' in data))
      throw new Error('Network API returned an invalid response');
    setSnapshot(data);
  }, []);

  const loadSpeedtestOverview = useCallback(async () => {
    const response = await resilientFetch('/api/modules/network/speedtest', {
      cache: 'no-store',
      timeout: SPEEDTEST_OVERVIEW_TIMEOUT_MS,
      retries: 1,
      retryDelay: 300,
      retryOnStatuses: TRANSIENT_RETRY_STATUSES,
    });
    const data = await safeJson<(NetworkSpeedtestOverview & ApiErrorPayload) | ApiErrorPayload>(
      response
    );
    if (!response.ok) throw new Error(data?.error || 'Failed to fetch speedtest history');
    if (!data || !('settings' in data)) {
      throw new Error('Speedtest API returned an invalid response');
    }
    setSpeedtestOverview(data);
    setSpeedtestRunning(Boolean(data.running));
  }, []);

  const runSpeedtest = useCallback(async () => {
    setSpeedtestRunning(true);
    try {
      const response = await resilientFetch('/api/modules/network/speedtest', {
        method: 'POST',
        cache: 'no-store',
        timeout: SPEEDTEST_RUN_TIMEOUT_MS,
        retries: 1,
        retryDelay: 250,
        retryOnStatuses: TRANSIENT_RETRY_STATUSES,
      });
      const data = await safeJson<SpeedtestRunResponse>(response);
      if (!response.ok) {
        throw new Error(
          typeof data === 'object' && data !== null && typeof data.error === 'string'
            ? data.error
            : 'Failed to run speedtest'
        );
      }
      if (typeof data !== 'object' || data === null || typeof data.status !== 'string') {
        throw new Error('Speedtest API returned an invalid response');
      }
      await loadSpeedtestOverview();
      if (data.status === 'failed') {
        toast({
          title: 'Speedtest failed',
          description: data.error || 'The speedtest command returned an error.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Speedtest complete',
          description: `${formatMbps(data.downloadMbps)} down, ${formatMbps(data.uploadMbps)} up`,
          variant: 'success',
        });
      }
    } catch (error) {
      toast({
        title: 'Speedtest failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSpeedtestRunning(false);
      await loadSpeedtestOverview().catch(() => {});
    }
  }, [loadSpeedtestOverview, toast]);

  const updateSpeedtestSchedule = useCallback(
    async (scheduleInterval: NetworkSpeedtestScheduleInterval) => {
      setScheduleSaving(true);
      try {
        const response = await resilientFetch('/api/modules/network/speedtest', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          timeout: NETWORK_REQUEST_TIMEOUT_MS,
          retries: 1,
          retryDelay: 250,
          retryOnStatuses: TRANSIENT_RETRY_STATUSES,
          body: JSON.stringify({ scheduleInterval }),
        });
        const data = await safeJson<ApiErrorPayload>(response);
        if (!response.ok) {
          throw new Error(
            typeof data === 'object' && data !== null && typeof data.error === 'string'
              ? data.error
              : 'Failed to update speedtest schedule'
          );
        }
        await loadSpeedtestOverview();
      } catch (error) {
        toast({
          title: 'Schedule update failed',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        setScheduleSaving(false);
      }
    },
    [loadSpeedtestOverview, toast]
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadSnapshot()
      .catch((error: unknown) => {
        if (active) {
          toast({
            title: 'Network snapshot failed',
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

  useEffect(() => {
    let active = true;
    setSpeedtestLoading(true);
    loadSpeedtestOverview()
      .catch((error: unknown) => {
        if (active) {
          toast({
            title: 'Speedtest history failed',
            description: error instanceof Error ? error.message : 'Unknown error',
            variant: 'destructive',
          });
        }
      })
      .finally(() => {
        if (active) setSpeedtestLoading(false);
      });

    const interval = window.setInterval(() => {
      loadSpeedtestOverview().catch(() => {});
    }, 60000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [loadSpeedtestOverview, toast]);

  const bandwidthData = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.history.map((entry) => {
      const row: Record<string, string | number> = {
        timestamp: new Date(entry.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      };
      entry.stats.forEach((s) => {
        if (selectedIface === 'all' || s.iface === selectedIface) {
          row[`${s.iface}_rx`] = s.rx_sec;
          row[`${s.iface}_tx`] = s.tx_sec;
        }
      });
      return row;
    });
  }, [snapshot, selectedIface]);

  const connectionStates = useMemo(() => {
    if (!snapshot) return [];
    const states: Record<string, number> = {};
    snapshot.connections.forEach((c) => {
      states[c.state] = (states[c.state] || 0) + 1;
    });
    return Object.entries(states).map(([name, value]) => ({ name, value }));
  }, [snapshot]);

  const visibleConnections = useMemo(() => snapshot?.connections.slice(0, 50) ?? [], [snapshot]);

  const packetStats = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.stats
      .filter((s) => selectedIface === 'all' || s.iface === selectedIface)
      .map((s) => ({
        name: s.iface,
        rx: s.rx_packets,
        tx: s.tx_packets,
        errors: s.rx_errors + s.tx_errors,
        dropped: s.rx_dropped + s.tx_dropped,
      }));
  }, [snapshot, selectedIface]);

  const selectedInterfaces = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.interfaces.filter((i) => selectedIface === 'all' || i.iface === selectedIface);
  }, [snapshot, selectedIface]);

  const selectedStats = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.stats.filter((s) => selectedIface === 'all' || s.iface === selectedIface);
  }, [snapshot, selectedIface]);

  const statsByInterface = useMemo(
    () => new Map(snapshot?.stats.map((stats) => [stats.iface, stats]) ?? []),
    [snapshot]
  );

  const speedtestHistory = useMemo(() => speedtestOverview?.history ?? [], [speedtestOverview]);
  const latestSpeedtest = speedtestOverview?.latest ?? null;
  const speedtestResultUrl = getSafeHttpUrl(latestSpeedtest?.resultUrl);
  const speedtestChartData = useMemo(
    () =>
      [...speedtestHistory]
        .reverse()
        .filter((result) => result.status === 'completed')
        .map((result) => ({
          time: formatSpeedtestDate(result.finishedAt),
          download: result.downloadMbps ?? 0,
          upload: result.uploadMbps ?? 0,
          ping: result.pingMs ?? 0,
        })),
    [speedtestHistory]
  );

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-border/60 bg-[radial-gradient(circle_at_top_left,var(--primary)/0.18,transparent_40%),linear-gradient(180deg,var(--card),color-mix(in_oklab,var(--card)_92%,transparent))] p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Network Intelligence
            </h2>
            <p className="text-sm text-muted-foreground">
              Real-time bandwidth, interfaces, and connections monitoring.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex min-h-[44px] flex-col justify-center rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Interface
              <select
                className="mt-1 bg-transparent text-sm font-semibold text-foreground outline-none"
                value={selectedIface}
                onChange={(e) => setSelectedIface(e.target.value)}
              >
                <option value="all">All Interfaces</option>
                {snapshot?.interfaces.map((i) => (
                  <option key={i.iface} value={i.iface}>
                    {i.iface} ({i.ip4 || 'No IP'})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-h-[44px] flex-col justify-center rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Refresh
              <select
                className="mt-1 bg-transparent text-sm font-semibold text-foreground outline-none"
                value={String(refreshMs)}
                onChange={(e) => setRefreshMs(Number(e.target.value))}
              >
                <option value="2000">2 sec</option>
                <option value="5000">5 sec</option>
                <option value="10000">10 sec</option>
              </select>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => loadSnapshot()}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/70 px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
              >
                <RefreshCcw className="h-4 w-4" />
                Refresh now
              </button>
            </div>
          </div>
        </div>
      </section>

      <Card className="overflow-hidden border-border/60">
        <CardHeader>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-primary" />
                Internet Speedtest
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Manual and scheduled WAN throughput checks using the host speedtest CLI.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => setShowSpeedtestHistory(true)}
                disabled={speedtestHistory.length === 0}
              >
                <History className="h-4 w-4" />
                History
              </Button>
              <Button onClick={runSpeedtest} disabled={speedtestRunning}>
                {speedtestRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Gauge className="h-4 w-4" />
                )}
                {speedtestRunning ? 'Running' : 'Run test'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <ArrowDown className="h-3.5 w-3.5 text-success" />
                Download
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums">
                {speedtestLoading ? '-' : formatMbps(latestSpeedtest?.downloadMbps)}
              </p>
            </div>
            <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <ArrowUp className="h-3.5 w-3.5 text-primary" />
                Upload
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums">
                {speedtestLoading ? '-' : formatMbps(latestSpeedtest?.uploadMbps)}
              </p>
            </div>
            <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <Zap className="h-3.5 w-3.5 text-warning" />
                Ping
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums">
                {speedtestLoading ? '-' : formatLatency(latestSpeedtest?.pingMs)}
              </p>
            </div>
            <label className="rounded-xl border border-border/50 bg-muted/20 p-4">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5 text-accent" />
                Schedule
              </span>
              <select
                className="mt-2 w-full bg-transparent text-sm font-semibold text-foreground outline-none"
                value={speedtestOverview?.settings.scheduleInterval ?? 'off'}
                onChange={(event) =>
                  updateSpeedtestSchedule(event.target.value as NetworkSpeedtestScheduleInterval)
                }
                disabled={scheduleSaving}
              >
                {scheduleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 text-sm lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <Badge
                variant={
                  latestSpeedtest?.status === 'failed'
                    ? 'destructive'
                    : speedtestRunning
                      ? 'secondary'
                      : 'outline'
                }
              >
                {speedtestRunning
                  ? 'RUNNING'
                  : latestSpeedtest?.status
                    ? latestSpeedtest.status.toUpperCase()
                    : 'NO RUNS'}
              </Badge>
              <span>
                Last run {formatSpeedtestDate(latestSpeedtest?.finishedAt)}
                {latestSpeedtest?.trigger ? ` by ${latestSpeedtest.trigger}` : ''}
              </span>
              {speedtestOverview?.settings.nextRunAt && (
                <span>
                  Next scheduled {formatSpeedtestDate(speedtestOverview.settings.nextRunAt)}
                </span>
              )}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="truncate">
                {latestSpeedtest?.serverName || 'Server unavailable'}
                {latestSpeedtest?.serverLocation ? ` - ${latestSpeedtest.serverLocation}` : ''}
              </span>
              {latestSpeedtest?.isp && (
                <Badge variant="outline" className="max-w-[180px] truncate">
                  {latestSpeedtest.isp}
                </Badge>
              )}
              {speedtestResultUrl && (
                <a
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                  href={speedtestResultUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Result
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>

          {latestSpeedtest?.status === 'failed' && latestSpeedtest.error && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
              {latestSpeedtest.error}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {selectedInterfaces.map((iface) => {
          const stats = statsByInterface.get(iface.iface);
          return (
            <Card
              key={iface.iface}
              className="group overflow-hidden border-border/60 bg-card/80 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card hover:shadow-[0_18px_36px_-28px_color-mix(in_oklab,var(--primary)_45%,transparent)]"
            >
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      {iface.iface}
                    </p>
                    <p className="text-sm font-mono mt-1">{iface.ip4 || '-'}</p>
                  </div>
                  <Badge variant={iface.operstate === 'up' ? 'success' : 'destructive'}>
                    {iface.operstate.toUpperCase()}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-muted/20 px-2 py-1.5 text-muted-foreground transition-colors group-hover:border-success/30 group-hover:bg-success/5">
                    <ArrowDown className="h-3 w-3 text-success" />
                    <span className="truncate tabular-nums">
                      {stats ? formatBytes(stats.rx_sec) : '0 B'}/s
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-muted/20 px-2 py-1.5 text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:bg-primary/5">
                    <ArrowUp className="h-3 w-3 text-primary" />
                    <span className="truncate tabular-nums">
                      {stats ? formatBytes(stats.tx_sec) : '0 B'}/s
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-border/40 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  <span>{iface.speed > 0 ? formatSpeed(iface.speed) : 'N/A Speed'}</span>
                  <span>MTU {iface.mtu}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <section className="grid gap-6 2xl:grid-cols-[2fr_1fr]">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Bandwidth History</CardTitle>
            <p className="text-sm text-muted-foreground">
              Real-time throughput trends across selected interfaces.
            </p>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={bandwidthData}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                  minTickGap={30}
                />
                <YAxis
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                  tickFormatter={(val) => formatBytes(val)}
                />
                <Tooltip
                  formatter={tooltipBytes}
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                />
                <Legend />
                {selectedStats.map((s, idx) => (
                  <Fragment key={s.iface}>
                    <Area
                      type="monotone"
                      dataKey={`${s.iface}_rx`}
                      stroke={chartColors[idx % chartColors.length]}
                      fill={chartColors[idx % chartColors.length]}
                      fillOpacity={0.15}
                      name={`${s.iface} Down`}
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey={`${s.iface}_tx`}
                      stroke={chartColors[(idx + 1) % chartColors.length]}
                      fill={chartColors[(idx + 1) % chartColors.length]}
                      fillOpacity={0.05}
                      name={`${s.iface} Up`}
                      strokeWidth={2}
                    />
                  </Fragment>
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Connection States</CardTitle>
            <p className="text-sm text-muted-foreground">
              Distribution of active TCP socket states.
            </p>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={connectionStates}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={4}
                  stroke="var(--card)"
                  strokeWidth={2}
                >
                  {connectionStates.map((entry, index) => (
                    <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 2xl:grid-cols-[1fr_2fr]">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Packet Statistics</CardTitle>
            <p className="text-sm text-muted-foreground">
              Comparison of packet counts, errors, and drops.
            </p>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={packetStats}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                <YAxis
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                  scale="log"
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                />
                <Legend />
                <Bar dataKey="rx" fill="var(--success)" name="Packets RX" radius={[4, 4, 0, 0]} />
                <Bar dataKey="tx" fill="var(--primary)" name="Packets TX" radius={[4, 4, 0, 0]} />
                <Bar
                  dataKey="errors"
                  fill="var(--destructive)"
                  name="Errors"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Active Connections</CardTitle>
                <p className="text-sm text-muted-foreground">
                  List of current TCP/UDP sockets and associated processes.
                </p>
              </div>
              <Badge variant="outline">{snapshot?.connections.length || 0} total</Badge>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-[0.18em] text-muted-foreground">
                <tr>
                  <th className="pb-3 pr-4">Proto</th>
                  <th className="pb-3 pr-4">Local Address</th>
                  <th className="pb-3 pr-4">Peer Address</th>
                  <th className="pb-3 pr-4">State</th>
                  <th className="pb-3">Process</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {visibleConnections.map((conn, idx) => (
                  <tr
                    key={`${conn.localAddress}-${conn.localPort}-${idx}`}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="py-2.5 pr-4">
                      <Badge variant="outline" className="text-[10px] uppercase font-bold">
                        {conn.protocol}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs">
                      {conn.localAddress}:{conn.localPort}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs">
                      {conn.peerAddress}:{conn.peerPort}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={cn(
                          'text-[10px] font-bold uppercase tracking-tight',
                          conn.state === 'ESTABLISHED'
                            ? 'text-success'
                            : conn.state === 'LISTEN'
                              ? 'text-primary'
                              : 'text-muted-foreground'
                        )}
                      >
                        {conn.state}
                      </span>
                    </td>
                    <td className="py-2.5 font-medium truncate max-w-[150px]">
                      <div className="flex items-center gap-2">
                        <Shield className="h-3 w-3 text-muted-foreground" />
                        <span>{conn.process}</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {snapshot && snapshot.connections.length > 50 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-3 text-center text-xs text-muted-foreground italic"
                    >
                      Showing first 50 of {snapshot.connections.length} connections.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      <Card className="border-border/60">
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Network Diagnostics Terminal</CardTitle>
              <p className="text-sm text-muted-foreground">
                Run native network tools for deep packet analysis and troubleshooting.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setTerminalCommand('ip addr\n')}>
                ip addr
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setTerminalCommand('netstat -tpln\n')}
              >
                netstat
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setTerminalCommand('ping -c 4 8.8.8.8\n')}
              >
                ping
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setTerminalCommand('mtr --report google.com\n')}
              >
                mtr
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-2xl border border-border/60 bg-background/80 overflow-hidden shadow-inner">
            <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3 bg-muted/20">
              <TerminalSquare className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                Active Shell Session
              </span>
              <div className="ml-auto flex gap-1">
                <div className="w-2 h-2 rounded-full bg-destructive/40" />
                <div className="w-2 h-2 rounded-full bg-warning/40" />
                <div className="w-2 h-2 rounded-full bg-success/40" />
              </div>
            </div>
            <div className="h-[400px]">
              <TerminalUI sessionId={sessionId} initialCommand={terminalCommand} />
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-6 md:grid-cols-2">
        <NetworkAlerts alerts={snapshot?.alerts} />
        <QuickInsights snapshot={snapshot} />
      </section>

      {showSpeedtestHistory && (
        <SpeedtestHistoryModal
          history={speedtestHistory}
          chartData={speedtestChartData}
          onClose={() => setShowSpeedtestHistory(false)}
        />
      )}
    </div>
  );
}
