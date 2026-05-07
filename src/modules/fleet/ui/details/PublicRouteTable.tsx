'use client';
import { useEffect, useState } from 'react';
import { ExternalLink, RadioTower, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { ExposeServiceWizard } from './ExposeServiceWizard';
import { ExposeForm, INITIAL_FORM } from './exposeService/schema';

interface PublicRouteRow {
  _id: string;
  name: string;
  slug: string;
  domain: string;
  status: string;
  tlsEnabled: boolean;
  tlsProvider?: 'letsencrypt' | 'manual' | 'reverse_proxy';
  accessMode: string;
  nodeId: string;
  proxyRuleName: string;
  target?: {
    localIp: string;
    localPort: number;
    protocol: 'http' | 'https' | 'tcp';
  };
  websocketEnabled?: boolean;
  timeoutSeconds?: number;
  maxBodyMb?: number;
  compression?: boolean;
  headers?: Record<string, string>;
  templateId?: string;
  healthStatus?: string;
  dnsStatus?: string;
}

interface RouteSuggestion {
  id: string;
  title: string;
  description: string;
  badge: string;
  targetLabel: string;
  sourceLabel: string;
  warning?: string;
  form: ExposeForm;
}

function buildPublicRouteUrl(route: PublicRouteRow): string {
  const protocol = route.tlsEnabled ? 'https' : 'http';
  return `${protocol}://${route.domain}`;
}

function formatTarget(route: PublicRouteRow): string {
  if (!route.target) return 'target: unknown';
  return `target: ${route.target.localIp}:${route.target.localPort}`;
}

function routeToForm(route: PublicRouteRow): ExposeForm {
  return {
    ...INITIAL_FORM,
    name: route.name,
    slug: route.slug,
    domain: route.domain,
    domainMode: 'custom',
    templateSlug: route.templateId,
    nodeId: route.nodeId,
    proxyRuleName: route.proxyRuleName,
    target: route.target ?? INITIAL_FORM.target,
    accessMode: route.accessMode as ExposeForm['accessMode'],
    tlsEnabled: route.tlsEnabled,
    tlsProvider: route.tlsProvider ?? INITIAL_FORM.tlsProvider,
    websocketEnabled: route.websocketEnabled ?? INITIAL_FORM.websocketEnabled,
    timeoutSeconds: route.timeoutSeconds ?? INITIAL_FORM.timeoutSeconds,
    maxBodyMb: route.maxBodyMb ?? INITIAL_FORM.maxBodyMb,
    compression: route.compression ?? INITIAL_FORM.compression,
    headers: route.headers ?? INITIAL_FORM.headers,
  };
}

export function PublicRouteTable({ nodeId }: { nodeId: string }) {
  const [routes, setRoutes] = useState<PublicRouteRow[] | null>(null);
  const [suggestions, setSuggestions] = useState<RouteSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [editingRoute, setEditingRoute] = useState<PublicRouteRow | null>(null);
  const [suggestedForm, setSuggestedForm] = useState<ExposeForm | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [routesRes, suggestionsRes] = await Promise.all([
          fetch(`/api/fleet/routes?nodeId=${encodeURIComponent(nodeId)}`),
          fetch(`/api/fleet/nodes/${encodeURIComponent(nodeId)}/route-suggestions`),
        ]);
        if (!routesRes.ok) throw new Error(`HTTP ${routesRes.status}`);
        const data = await routesRes.json();
        const suggestionData = suggestionsRes.ok
          ? ((await suggestionsRes.json().catch(() => ({}))) as {
              suggestions?: RouteSuggestion[];
            })
          : {};
        if (cancelled) return;
        setRoutes(data.routes ?? []);
        setSuggestions(suggestionData.suggestions ?? []);
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
          <Button
            type="button"
            onClick={() => {
              setEditingRoute(null);
              setSuggestedForm(null);
              setShowWizard(true);
            }}
          >
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
          {suggestions.length > 0 && (
            <section
              aria-labelledby="detected-services-title"
              className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3"
            >
              <div className="flex items-center gap-2">
                <RadioTower className="h-4 w-4 text-primary" aria-hidden="true" />
                <div>
                  <h3 id="detected-services-title" className="text-sm font-medium">
                    Detected services
                  </h3>
                  <div className="text-xs text-muted-foreground">
                    ServerMon app and module details reported by the local agent bridge.
                  </div>
                </div>
              </div>
              <div className="grid gap-2">
                {suggestions.map((suggestion) => (
                  <div
                    key={suggestion.id}
                    className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{suggestion.title}</span>
                        <Badge variant="outline">{suggestion.badge}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">{suggestion.description}</div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-mono">{suggestion.targetLabel}</span>
                        <span>{suggestion.sourceLabel}</span>
                      </div>
                      {suggestion.warning && (
                        <div className="flex items-start gap-1.5 text-xs text-warning">
                          <ShieldAlert className="mt-0.5 h-3.5 w-3.5" aria-hidden="true" />
                          <span>{suggestion.warning}</span>
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setEditingRoute(null);
                        setShowWizard(false);
                        setSuggestedForm(suggestion.form);
                      }}
                      aria-label={`Configure route for ${suggestion.form.name}`}
                      className="shrink-0"
                    >
                      Configure route
                    </Button>
                  </div>
                ))}
              </div>
            </section>
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
                <caption className="sr-only">List of public routes for the node</caption>
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th scope="col" className="py-2 pr-2 font-medium">
                      Name
                    </th>
                    <th scope="col" className="py-2 pr-2 font-medium">
                      Domain
                    </th>
                    <th scope="col" className="py-2 pr-2 font-medium">
                      Status
                    </th>
                    <th scope="col" className="py-2 pr-2 font-medium">
                      Access
                    </th>
                    <th scope="col" className="py-2 pr-2 font-medium">
                      TLS
                    </th>
                    <th scope="col" className="py-2 pr-2 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {routes.map((r) => (
                    <tr key={r._id} className="border-b border-border/50 last:border-none">
                      <td className="py-3 pr-2 align-top">
                        <div className="font-medium">{r.name}</div>
                        <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                          <div>slug: {r.slug}</div>
                          <div>proxy: {r.proxyRuleName}</div>
                        </div>
                      </td>
                      <td className="py-3 pr-2 align-top">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">{r.domain}</span>
                          <a
                            href={buildPublicRouteUrl(r)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open route ${r.name} in a new tab`}
                            title="Open route"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          </a>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{formatTarget(r)}</div>
                      </td>
                      <td className="py-2 pr-2">
                        <div className="space-y-1">
                          <Badge variant="outline">{r.status}</Badge>
                          <div className="space-y-0.5 text-xs text-muted-foreground">
                            <div>DNS: {r.dnsStatus ?? 'unknown'}</div>
                            <div>Health: {r.healthStatus ?? 'unknown'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-2 align-top text-xs">
                        <div>{r.accessMode}</div>
                        <div className="mt-1 space-y-0.5 text-muted-foreground">
                          <div>websocket: {r.websocketEnabled ? 'on' : 'off'}</div>
                          <div>compression: {r.compression ? 'on' : 'off'}</div>
                        </div>
                      </td>
                      <td className="py-3 pr-2 align-top text-xs">
                        <div>{r.tlsEnabled ? 'on' : 'off'}</div>
                        <div className="mt-1 text-muted-foreground">
                          TLS provider: {r.tlsProvider ?? 'unknown'}
                        </div>
                      </td>
                      <td className="py-2 pr-2">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={() => {
                              setSuggestedForm(null);
                              setEditingRoute(r);
                            }}
                            aria-label={`Edit route ${r.name}`}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={() => remove(r._id)}
                            aria-label={`Delete route ${r.name}`}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {(showWizard || editingRoute || suggestedForm) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Expose service wizard"
        >
          <div className="w-full max-w-4xl max-h-[90vh] overflow-auto">
            <ExposeServiceWizard
              nodeId={nodeId}
              mode={editingRoute ? 'edit' : 'create'}
              routeId={editingRoute?._id}
              initialForm={editingRoute ? routeToForm(editingRoute) : (suggestedForm ?? undefined)}
              onCreated={() => {
                setShowWizard(false);
                setSuggestedForm(null);
                setRefreshKey((k) => k + 1);
              }}
              onSaved={(updated) => {
                setEditingRoute(null);
                setSuggestedForm(null);
                setRoutes(
                  (prev) =>
                    prev?.map((route) =>
                      route._id === updated._id ? { ...route, ...updated } : route
                    ) ?? null
                );
              }}
              onCancel={() => {
                setShowWizard(false);
                setEditingRoute(null);
                setSuggestedForm(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
