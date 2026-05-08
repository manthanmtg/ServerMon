'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProShell from '@/components/layout/ProShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { resilientFetch, isAbortError } from '@/lib/fetch-utils';

interface RouteRow {
  _id: string;
  name: string;
  slug: string;
  domain: string;
  status: string;
  tlsEnabled: boolean;
  accessMode: string;
  nodeId: string;
  healthStatus?: string;
  dnsStatus?: string;
  tlsStatus?: string;
}

function AllRoutesList() {
  const [routes, setRoutes] = useState<RouteRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const res = await resilientFetch('/api/fleet/routes?limit=200', {
          signal: controller.signal,
          timeout: 10000,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setRoutes(data.routes ?? []);
        setError(null);
      } catch (e) {
        if (!isAbortError(e)) setError((e as Error).message);
      }
    };
    load();
    return () => {
      controller.abort();
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Public routes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
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
        {routes && routes.length === 0 && (
          <p className="text-sm text-muted-foreground">No public routes yet.</p>
        )}
        {routes && routes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-2 font-medium">Name</th>
                  <th className="py-2 pr-2 font-medium">Domain</th>
                  <th className="py-2 pr-2 font-medium">Status</th>
                  <th className="py-2 pr-2 font-medium">Access</th>
                  <th className="py-2 pr-2 font-medium">TLS</th>
                  <th className="py-2 pr-2 font-medium">DNS</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((r) => (
                  <tr
                    key={r._id}
                    className="border-b border-border/50 last:border-none hover:bg-muted/20"
                  >
                    <td className="py-2 pr-2">
                      <Link
                        href={`/fleet/routes/${r._id}`}
                        className="text-primary hover:underline"
                      >
                        {r.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-2 font-mono text-xs">{r.domain}</td>
                    <td className="py-2 pr-2">
                      <Badge variant="outline">{r.status}</Badge>
                    </td>
                    <td className="py-2 pr-2 text-xs">{r.accessMode}</td>
                    <td className="py-2 pr-2 text-xs">
                      {r.tlsStatus ?? (r.tlsEnabled ? 'on' : 'off')}
                    </td>
                    <td className="py-2 pr-2 text-xs">{r.dnsStatus ?? 'unknown'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function FleetRoutesPage() {
  return (
    <ProShell title="Fleet" subtitle="Public routes">
      <AllRoutesList />
    </ProShell>
  );
}
