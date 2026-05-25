'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, RefreshCcw, Timer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageSkeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { relativeTime } from '@/lib/utils';
import type {
  ServiceUnit,
  ServiceAlertSummary,
  ServiceTimerInfo,
  ServicesSnapshot,
} from '../types';
import type { ServiceAction, ServicesSortDir, ServicesSortField } from './components/ServicesTable';
import { ServicesViewTabs, type ViewTab } from './components/ServicesViewTabs';
import { ServicesSummaryGrid } from './components/ServicesSummaryGrid';
import { ServicesChartsPanel } from './components/ServicesChartsPanel';
import { ServicesTable } from './components/ServicesTable';

type FilterStatus = 'all' | 'running' | 'failed' | 'inactive' | 'exited';

const SERVICES_SNAPSHOT_TIMEOUT_MS = 8_000;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isServicesSnapshot(value: unknown): value is ServicesSnapshot {
  if (!isObject(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (!['systemd', 'mock'].includes(candidate.source as string)) {
    return false;
  }

  const summary = candidate.summary;
  if (!isObject(summary)) {
    return false;
  }

  const snapshot = summary as Record<string, unknown>;
  const services = candidate.services;
  const timers = candidate.timers;
  const alerts = candidate.alerts;
  const history = candidate.history;

  const hasValidServices = Array.isArray(services) &&
    services.every(
      (service) =>
        isObject(service) &&
        typeof (service as ServiceUnit).name === 'string' &&
        typeof (service as ServiceUnit).activeState === 'string'
    );
  const hasValidTimers = Array.isArray(timers) && timers.every((timer) => isObject(timer));
  const hasValidAlerts = Array.isArray(alerts) && alerts.every((alert) => isObject(alert));
  const hasValidHistory =
    Array.isArray(history) &&
    history.every((item) => isObject(item) && Array.isArray((item as Record<string, unknown>).services));

  return (
    typeof candidate.systemdAvailable === 'boolean' &&
    typeof summary === 'object' &&
    typeof snapshot.total === 'number' &&
    typeof snapshot.running === 'number' &&
    typeof snapshot.exited === 'number' &&
    typeof snapshot.failed === 'number' &&
    typeof snapshot.inactive === 'number' &&
    typeof snapshot.enabled === 'number' &&
    typeof snapshot.disabled === 'number' &&
    typeof snapshot.healthScore === 'number' &&
    hasValidServices &&
    hasValidTimers &&
    hasValidAlerts &&
    hasValidHistory &&
    typeof candidate.timestamp === 'string'
  );
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

type ServicesTimersPanelProps = {
  timers: ServiceTimerInfo[] | undefined;
};

type ServicesAlertsPanelProps = {
  alerts: ServiceAlertSummary[] | undefined;
};

function ServicesTimersPanel({ timers = [] }: ServicesTimersPanelProps) {
  return (
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
            {timers.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-muted-foreground">
                  No timers found.
                </td>
              </tr>
            ) : (
              timers.map((timer) => (
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
                    {timer.lastRun}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ServicesAlertsPanel({ alerts = [] }: ServicesAlertsPanelProps) {
  return (
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
        {alerts.length === 0 ? (
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
              {alerts.map((alert) => (
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
  );
}

type ServicesHeroSectionProps = {
  snapshot: ServicesSnapshot | null;
  filter: FilterStatus;
  refreshMs: number;
  onFilterChange: (filter: FilterStatus) => void;
  onRefreshMsChange: (refreshMs: number) => void;
  onRefresh: () => void;
};

function ServicesHeroSection({
  snapshot,
  filter,
  refreshMs,
  onFilterChange,
  onRefreshMsChange,
  onRefresh,
}: ServicesHeroSectionProps) {
  return (
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
              onChange={(event) => onFilterChange(event.target.value as FilterStatus)}
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
              onChange={(event) => onRefreshMsChange(Number(event.target.value))}
            >
              <option value="3000">3 sec</option>
              <option value="5000">5 sec</option>
              <option value="10000">10 sec</option>
              <option value="30000">30 sec</option>
            </select>
          </label>
          <button
            type="button"
            onClick={onRefresh}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh now
          </button>
        </div>
      </div>
    </section>
  );
}

export default function ServicesPage() {
  const { toast } = useToast();
  const [snapshot, setSnapshot] = useState<ServicesSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshMs, setRefreshMs] = useState(5000);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<ServicesSortField>('name');
  const [sortDir, setSortDir] = useState<ServicesSortDir>('asc');
  const [expandedService, setExpandedService] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<ViewTab>('services');
  const normalizedSearch = useMemo(() => search.trim().toLowerCase(), [search]);

  const loadSnapshot = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, SERVICES_SNAPSHOT_TIMEOUT_MS);

    try {
      const response = await fetch('/api/modules/services', {
        cache: 'no-store',
        signal: controller.signal,
      });

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new Error('Services snapshot response is not valid JSON');
      }

      if (!response.ok) {
        const message =
          isObject(data) && typeof data.error === 'string' ? data.error : `Request failed with ${response.status}`;
        throw new Error(message);
      }

      if (!isServicesSnapshot(data)) {
        throw new Error('Services snapshot response format is invalid');
      }

      setSnapshot(data);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Services snapshot request timed out after ${SERVICES_SNAPSHOT_TIMEOUT_MS}ms`);
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
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

    if (normalizedSearch) {
      list = list.filter((s) => {
        const name = s.name.toLowerCase();
        const description = s.description.toLowerCase();
        return name.includes(normalizedSearch) || description.includes(normalizedSearch);
      });
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
  }, [snapshot, filter, normalizedSearch, sortField, sortDir]);

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

  const toggleSort = useCallback(
    (field: ServicesSortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDir(field === 'name' ? 'asc' : 'desc');
      }
    },
    [sortField]
  );

  const runAction = useCallback(
    async (serviceName: string, action: ServiceAction) => {
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
    },
    [loadSnapshot, toast]
  );

  const handleFilterChange = useCallback((value: FilterStatus) => {
    setFilter(value);
  }, []);

  const handleRefreshMsChange = useCallback((value: number) => {
    setRefreshMs(value);
  }, []);

  const handleRefresh = useCallback(() => {
    void loadSnapshot().catch(() => undefined);
  }, [loadSnapshot]);

  const toggleExpandedService = useCallback((serviceName: string | null) => {
    setExpandedService(serviceName);
  }, []);

  const handleRunAction = useCallback(
    (serviceName: string, action: ServiceAction) => {
      void runAction(serviceName, action);
    },
    [runAction]
  );

  if (loading) {
    return <PageSkeleton statCards={3} />;
  }

      return (
    <div className="space-y-6" data-testid="services-page">
      <ServicesHeroSection
        snapshot={snapshot}
        filter={filter}
        refreshMs={refreshMs}
        onFilterChange={handleFilterChange}
        onRefreshMsChange={handleRefreshMsChange}
        onRefresh={handleRefresh}
      />

      <ServicesSummaryGrid summary={snapshot?.summary} alertsCount={snapshot?.alerts.length ?? 0} />

      <ServicesChartsPanel
        topByCpu={topByCpu}
        topByMemory={topByMemory}
        stateDistribution={stateDistribution}
        cpuHistory={cpuHistory}
      />

      <ServicesViewTabs
        alertsCount={snapshot?.alerts.length ?? 0}
        search={search}
        selectedTab={viewTab}
        onTabChange={setViewTab}
        onSearchChange={setSearch}
      />

      {/* Services table */}
      {viewTab === 'services' && (
        <ServicesTable
          services={filteredServices}
          totalServices={snapshot?.summary.total ?? 0}
          expandedService={expandedService}
          pendingAction={pendingAction}
          sortField={sortField}
          sortDir={sortDir}
          onToggleExpanded={toggleExpandedService}
          onToggleSort={toggleSort}
          onRunAction={handleRunAction}
        />
      )}

      {/* Timers tab */}
      {viewTab === 'timers' && <ServicesTimersPanel timers={snapshot?.timers} />}

      {/* Alerts tab */}
      {viewTab === 'alerts' && <ServicesAlertsPanel alerts={snapshot?.alerts} />}
    </div>
  );
}
