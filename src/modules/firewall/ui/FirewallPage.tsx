'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Filter,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageSkeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { FirewallCheck, FirewallRule, FirewallRuleAction, FirewallSnapshot } from '../types';

type ActionFilter = 'all' | FirewallRuleAction;

const WELL_KNOWN: Record<string, string> = {
  '22': 'SSH',
  '80': 'HTTP',
  '443': 'HTTPS',
  '3306': 'MySQL',
  '5432': 'PostgreSQL',
  '6379': 'Redis',
  '9200': 'Elasticsearch',
  '27017': 'MongoDB',
};

function statusBadgeVariant(status: FirewallCheck['status']): BadgeVariant {
  if (status === 'pass') return 'success';
  if (status === 'fail') return 'destructive';
  if (status === 'warn') return 'warning';
  return 'secondary';
}

function actionBadgeVariant(action: FirewallRuleAction): BadgeVariant {
  if (action === 'allow') return 'success';
  if (action === 'deny' || action === 'reject') return 'destructive';
  if (action === 'limit') return 'warning';
  return 'secondary';
}

function scoreTone(score: number): string {
  if (score >= 85) return 'text-success';
  if (score >= 65) return 'text-warning';
  return 'text-destructive';
}

export function getFilteredFirewallRules(
  rules: FirewallRule[],
  actionFilter: ActionFilter,
  search: string
): FirewallRule[] {
  const query = search.trim().toLowerCase();
  return rules
    .filter((rule) => actionFilter === 'all' || rule.action === actionFilter)
    .filter((rule) => {
      if (!query) return true;
      const serviceName = WELL_KNOWN[rule.port] || '';
      return (
        rule.to.toLowerCase().includes(query) ||
        rule.from.toLowerCase().includes(query) ||
        rule.action.toLowerCase().includes(query) ||
        rule.direction.toLowerCase().includes(query) ||
        rule.protocol.toLowerCase().includes(query) ||
        rule.port.toLowerCase().includes(query) ||
        serviceName.toLowerCase().includes(query)
      );
    });
}

function SummaryCard({
  title,
  value,
  detail,
  icon,
  tone,
}: {
  title: string;
  value: string | number;
  detail: string;
  icon: ReactNode;
  tone?: string;
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="pb-4 pt-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          <div className="min-w-0">
            <p className={cn('text-2xl font-bold tabular-nums', tone)}>{value}</p>
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{detail}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FirewallPage() {
  const [snapshot, setSnapshot] = useState<FirewallSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/modules/firewall', { cache: 'no-store' });
      if (response.ok) {
        const data: FirewallSnapshot = await response.json();
        setSnapshot(data);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 30000);
    return () => window.clearInterval(interval);
  }, [load]);

  const filteredRules = useMemo(
    () => getFilteredFirewallRules(snapshot?.rules ?? [], actionFilter, search),
    [snapshot?.rules, actionFilter, search]
  );

  const handleRefresh = () => {
    setRefreshing(true);
    load();
  };

  if (loading && !snapshot) {
    return <PageSkeleton statCards={4} />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard
          title="Firewall Posture"
          value={snapshot?.summary.healthScore ?? 0}
          detail={snapshot?.enabled ? 'Active firewall' : 'Review required'}
          icon={<Shield className="h-5 w-5" />}
          tone={scoreTone(snapshot?.summary.healthScore ?? 0)}
        />
        <SummaryCard
          title="Rules"
          value={snapshot?.summary.rulesCount ?? 0}
          detail={`${snapshot?.summary.allowCount ?? 0} allow, ${
            snapshot?.summary.limitCount ?? 0
          } limited`}
          icon={<ShieldCheck className="h-5 w-5" />}
        />
        <SummaryCard
          title="Default Incoming"
          value={snapshot?.defaultIncoming || '--'}
          detail={`Outgoing ${snapshot?.defaultOutgoing || 'unknown'}`}
          icon={<LockKeyhole className="h-5 w-5" />}
        />
        <SummaryCard
          title="Sensitive Exposure"
          value={snapshot?.summary.exposedWellKnownCount ?? 0}
          detail="Global sensitive allows"
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={(snapshot?.summary.exposedWellKnownCount ?? 0) > 0 ? 'text-destructive' : undefined}
        />
      </div>

      <Card className="border-border/60">
        <CardHeader className="border-b border-border/40 pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="h-4 w-4 text-primary" />
                Firewall Checks
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Backend {snapshot?.backend ?? 'none'} · {snapshot?.source ?? 'mock'} source
              </p>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:bg-accent"
            >
              {refreshing ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </button>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid gap-3 md:grid-cols-2">
            {(snapshot?.checks ?? []).map((check) => (
              <div key={check.id} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-2">
                    {check.status === 'pass' ? (
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{check.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{check.details}</p>
                    </div>
                  </div>
                  <Badge variant={statusBadgeVariant(check.status)} className="capitalize">
                    {check.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="border-b border-border/40 pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Filter className="h-4 w-4 text-primary" />
              Firewall Rules
            </CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search rules"
                  aria-label="Search firewall rules"
                  className="h-11 w-full rounded-lg border border-border bg-secondary pl-9 pr-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-primary/30 sm:w-64"
                />
              </div>
              <select
                value={actionFilter}
                onChange={(event) => setActionFilter(event.target.value as ActionFilter)}
                aria-label="Filter rules by action"
                className="h-11 rounded-lg border border-border bg-secondary px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="all">All actions</option>
                <option value="allow">Allow</option>
                <option value="limit">Limit</option>
                <option value="deny">Deny</option>
                <option value="reject">Reject</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-border/60 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 text-left font-medium">To</th>
                  <th className="px-3 py-3 text-left font-medium">Action</th>
                  <th className="px-3 py-3 text-left font-medium">Direction</th>
                  <th className="px-3 py-3 text-left font-medium">From</th>
                  <th className="px-3 py-3 text-left font-medium">Protocol</th>
                  <th className="px-3 py-3 text-left font-medium">Family</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredRules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-accent/20">
                    <td className="px-3 py-3 font-mono text-xs">{rule.to}</td>
                    <td className="px-3 py-3">
                      <Badge variant={actionBadgeVariant(rule.action)} className="capitalize">
                        {rule.action}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 uppercase text-muted-foreground">{rule.direction}</td>
                    <td className="px-3 py-3 font-mono text-xs">{rule.from}</td>
                    <td className="px-3 py-3 uppercase text-muted-foreground">{rule.protocol}</td>
                    <td className="px-3 py-3 uppercase text-muted-foreground">
                      {rule.addressFamily}
                    </td>
                  </tr>
                ))}
                {filteredRules.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No firewall rules match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
