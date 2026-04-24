'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { ExposeServiceWizard } from './ExposeServiceWizard';

interface PublicRouteRow {
  _id: string;
  name: string;
  slug: string;
  domain: string;
  status: string;
  tlsEnabled: boolean;
  accessMode: string;
  healthStatus?: string;
  dnsStatus?: string;
}

export function PublicRouteTable({ nodeId }: { nodeId: string }) {
  const [routes, setRoutes] = useState<PublicRouteRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/fleet/routes?nodeId=${encodeURIComponent(nodeId)}`);
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
  }, [nodeId, refreshKey]);

  const remove = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/fleet/routes/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setRoutes((prev) => prev?.filter((r) => r._id !== id) ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Public Routes</CardTitle>
          <Button type="button" onClick={() => setShowWizard(true)}>
            Add route
          </Button>
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
                    <th className="py-2 pr-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {routes.map((r) => (
                    <tr key={r._id} className="border-b border-border/50 last:border-none">
                      <td className="py-2 pr-2">{r.name}</td>
                      <td className="py-2 pr-2 font-mono text-xs">{r.domain}</td>
                      <td className="py-2 pr-2">
                        <Badge variant="outline">{r.status}</Badge>
                      </td>
                      <td className="py-2 pr-2 text-xs">{r.accessMode}</td>
                      <td className="py-2 pr-2 text-xs">{r.tlsEnabled ? 'on' : 'off'}</td>
                      <td className="py-2 pr-2 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          onClick={() => remove(r._id)}
                          aria-label={`Delete route ${r.name}`}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showWizard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Expose service wizard"
        >
          <div className="w-full max-w-4xl max-h-[90vh] overflow-auto">
            <ExposeServiceWizard
              nodeId={nodeId}
              onCreated={() => {
                setShowWizard(false);
                setRefreshKey((k) => k + 1);
              }}
              onCancel={() => setShowWizard(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
