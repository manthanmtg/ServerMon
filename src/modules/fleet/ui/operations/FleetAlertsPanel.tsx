'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

interface NodeRow {
  _id: string;
  name: string;
  slug: string;
  status: string;
  tunnelStatus?: string;
  computedStatus?: string;
}

interface RouteRow {
  _id: string;
  name: string;
  slug: string;
  domain: string;
  status?: string;
  dnsStatus?: string;
  tlsStatus?: string;
}

interface LogEvent {
  _id: string;
  createdAt: string;
  message?: string;
  eventType?: string;
  nodeId?: string;
  routeId?: string;
}

interface Alert {
  id: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  href?: string;
}

function severityVariant(s: Alert['severity']): BadgeVariant {
  if (s === 'error') return 'destructive';
  if (s === 'warning') return 'warning';
  return 'outline';
}

export function FleetAlertsPanel() {
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [nRes, rRes, lRes] = await Promise.all([
          fetch('/api/fleet/nodes?limit=200'),
          fetch('/api/fleet/routes?limit=200'),
          fetch('/api/fleet/logs?level=error&limit=50'),
        ]);
        const derived: Alert[] = [];

        if (nRes.ok) {
          const data: { nodes?: NodeRow[] } = await nRes.json();
          const nodes = data.nodes ?? [];
          const bad = nodes.filter((n) => {
            const s = n.computedStatus ?? n.status;
            return s === 'offline' || s === 'error' || s === 'degraded';
          });
          if (bad.length > 0) {
            derived.push({
              id: 'nodes.bad',
              severity: bad.some((n) => (n.computedStatus ?? n.status) === 'error')
                ? 'error'
                : 'warning',
              title: `${bad.length} node(s) unhealthy`,
              description: bad
                .slice(0, 5)
                .map((n) => `${n.name} (${n.computedStatus ?? n.status})`)
                .join(', '),
              href: '/fleet',
            });
          }
        }

        if (rRes.ok) {
          const data: { routes?: RouteRow[] } = await rRes.json();
          const routes = data.routes ?? [];
          const bad = routes.filter(
            (r) =>
              (r.dnsStatus && r.dnsStatus !== 'ok' && r.dnsStatus !== 'unknown') ||
              (r.tlsStatus && r.tlsStatus !== 'active' && r.tlsStatus !== 'unknown')
          );
          if (bad.length > 0) {
            derived.push({
              id: 'routes.bad',
              severity: 'warning',
              title: `${bad.length} route(s) with bad DNS/TLS`,
              description: bad
                .slice(0, 5)
                .map((r) => r.domain)
                .join(', '),
              href: '/fleet/routes',
            });
          }
        }

        if (lRes.ok) {
          const data: { events?: LogEvent[] } = await lRes.json();
          const events = data.events ?? [];
          if (events.length > 0) {
            derived.push({
              id: 'logs.errors',
              severity: 'error',
              title: `${events.length} recent error event(s)`,
              description: events
                .slice(0, 3)
                .map((e) => e.message ?? e.eventType ?? '')
                .filter(Boolean)
                .join(' · '),
              href: '/fleet/logs',
            });
          }
        }

        if (cancelled) return;
        setAlerts(derived);
        setError(null);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fleet alerts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div
            role="alert"
            className="rounded border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive"
          >
            {error}
          </div>
        )}
        {loading && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}
        {!loading && alerts.length === 0 && (
          <p className="text-sm text-muted-foreground">All fleet systems healthy.</p>
        )}
        {!loading && alerts.length > 0 && (
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li key={a.id} className="rounded border border-border p-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={severityVariant(a.severity)}>{a.severity}</Badge>
                  {a.href && (
                    <Link href={a.href} className="text-xs underline text-primary">
                      View
                    </Link>
                  )}
                </div>
                <div className="text-sm font-medium">{a.title}</div>
                <div className="text-xs text-muted-foreground">{a.description}</div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
