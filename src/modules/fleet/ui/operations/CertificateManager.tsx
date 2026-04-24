'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

interface RouteRow {
  _id: string;
  name: string;
  domain: string;
  tlsStatus?: string;
  tlsProvider?: string;
  tlsEnabled: boolean;
}

function tlsVariant(status: string | undefined): BadgeVariant {
  switch (status) {
    case 'active':
      return 'success';
    case 'pending':
      return 'default';
    case 'failed':
    case 'expired':
      return 'destructive';
    default:
      return 'outline';
  }
}

export function CertificateManager() {
  const [routes, setRoutes] = useState<RouteRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/fleet/routes?limit=200');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setRoutes(data.routes ?? []);
        setError(null);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = (routes ?? []).reduce<Record<string, number>>((acc, r) => {
    const key = r.tlsStatus ?? 'unknown';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Certificate status</CardTitle>
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
          {!routes && (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          )}
          {routes && (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                {Object.entries(groups).map(([k, v]) => (
                  <Badge key={k} variant={tlsVariant(k)}>
                    {k}: {v}
                  </Badge>
                ))}
                {Object.keys(groups).length === 0 && (
                  <span className="text-muted-foreground">No routes configured yet.</span>
                )}
              </div>
              {routes.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="py-2 pr-2 font-medium">Domain</th>
                        <th className="py-2 pr-2 font-medium">TLS status</th>
                        <th className="py-2 pr-2 font-medium">Provider</th>
                        <th className="py-2 pr-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {routes.map((r) => (
                        <tr key={r._id} className="border-b border-border/50 last:border-none">
                          <td className="py-2 pr-2 font-mono text-xs">{r.domain}</td>
                          <td className="py-2 pr-2">
                            <Badge variant={tlsVariant(r.tlsStatus)}>
                              {r.tlsStatus ?? 'unknown'}
                            </Badge>
                          </td>
                          <td className="py-2 pr-2 text-xs">{r.tlsProvider ?? '—'}</td>
                          <td className="py-2 pr-2 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled
                              title="Automatic renewal starts in Phase 2"
                            >
                              Renew
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
