'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, RefreshCcw, RotateCw, Server } from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';

interface ServerMonStatus {
  installed: boolean;
  serviceName: string;
  serviceState: string;
  serviceEnabled: boolean | 'unknown';
  port: number;
  installDir?: string;
  healthUrl: string;
  healthStatus: string;
  lastCheckedAt?: string | null;
  lastError?: string;
}

interface RouteIntent {
  name: string;
  slug: string;
  domain: string;
  nodeId: string;
  proxyRuleName: string;
  target: { localIp: string; localPort: number; protocol: 'http' };
  tlsEnabled: boolean;
  tlsProvider: 'letsencrypt';
  accessMode: 'servermon_auth';
  websocketEnabled: boolean;
  compression: boolean;
  timeoutSeconds: number;
  maxBodyMb: number;
}

interface ServerMonRoute {
  _id: string;
  domain: string;
  status: string;
  healthStatus?: string;
  tlsEnabled?: boolean;
}

interface ServerMonResponse {
  servermon: ServerMonStatus;
  node: { _id: string; name: string; slug: string; tunnelStatus: string };
  canInstall: boolean;
  route: ServerMonRoute | null;
  defaultRouteIntent: RouteIntent;
}

interface InstallLogEvent {
  _id: string;
  createdAt?: string;
  service?: string;
  level: string;
  eventType: string;
  message: string;
  metadata?: { commandId?: unknown };
}

function publicRouteUrl(route: ServerMonRoute): string {
  return `${route.tlsEnabled === false ? 'http' : 'https'}://${route.domain}`;
}

function statusVariant(status: string): 'default' | 'outline' | 'secondary' | 'destructive' {
  if (status === 'running' || status === 'healthy' || status === 'active') return 'default';
  if (status === 'failed' || status === 'unhealthy' || status === 'down') return 'destructive';
  return 'outline';
}

function logLevelVariant(level: string): BadgeVariant {
  if (level === 'error') return 'destructive';
  if (level === 'warn') return 'warning';
  return 'outline';
}

function isInstallEvent(event: InstallLogEvent): boolean {
  return event.eventType === 'servermon.install_queued' || event.eventType.startsWith('servermon.install.');
}

function isTerminalInstallEvent(event: InstallLogEvent): boolean {
  return event.eventType === 'servermon.install.succeeded' || event.eventType === 'servermon.install.failed';
}

function logEventTime(event: InstallLogEvent): number {
  if (!event.createdAt) return 0;
  const time = new Date(event.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function NodeServerMonPanel({ nodeId }: { nodeId: string }) {
  const { toast } = useToast();
  const [data, setData] = useState<ServerMonResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mongoUri, setMongoUri] = useState('');
  const [mongoError, setMongoError] = useState<string | null>(null);
  const [port, setPort] = useState(8912);
  const [skipMongo, setSkipMongo] = useState(true);
  const [createPublicRoute, setCreatePublicRoute] = useState(false);
  const [routeDomain, setRouteDomain] = useState('');
  const [installLogStartedAt, setInstallLogStartedAt] = useState<string | null>(null);
  const [installCommandId, setInstallCommandId] = useState<string | null>(null);
  const [installLogs, setInstallLogs] = useState<InstallLogEvent[]>([]);
  const [installLogsError, setInstallLogsError] = useState<string | null>(null);
  const [installLogPolling, setInstallLogPolling] = useState(false);

  const load = useCallback(async (): Promise<ServerMonResponse | null> => {
    try {
      const res = await fetch(`/api/fleet/nodes/${nodeId}/servermon`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as ServerMonResponse;
      setData(body);
      setRouteDomain((prev) => prev || body.defaultRouteIntent.domain);
      setPort((prev) => prev || body.defaultRouteIntent.target.localPort);
      setError(null);
      return body;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load ServerMon status';
      setError(message);
      return null;
    }
  }, [nodeId]);

  const loadInstallLogs = useCallback(
    async (startedAt = installLogStartedAt, commandId = installCommandId) => {
      if (!startedAt) return;
      try {
        const params = new URLSearchParams({
          nodeId,
          since: startedAt,
          limit: '100',
        });
        const res = await fetch(`/api/fleet/logs?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { events?: InstallLogEvent[] };
        const events = (body.events ?? [])
          .filter((event) => {
            if (!isInstallEvent(event)) return false;
            const eventCommandId = event.metadata?.commandId;
            return !commandId || !eventCommandId || eventCommandId === commandId;
          })
          .sort((a, b) => logEventTime(a) - logEventTime(b));
        setInstallLogs(events);
        setInstallLogsError(null);
        if (events.some(isTerminalInstallEvent)) {
          setInstallLogPolling(false);
          void load();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to load install logs';
        setInstallLogsError(message);
      }
    },
    [installCommandId, installLogStartedAt, load, nodeId]
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const body = await load();
      if (cancelled || !body) return;
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (!installLogPolling || !installLogStartedAt) return;
    let cancelled = false;
    const run = async () => {
      if (!cancelled) await loadInstallLogs();
    };
    void run();
    const interval = setInterval(() => {
      void run();
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [installLogPolling, installLogStartedAt, loadInstallLogs]);

  const queueRecheck = async () => {
    setBusy(true);
    try {
      await fetch(`/api/fleet/nodes/${nodeId}/servermon/recheck`, { method: 'POST' });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const queueRestart = async () => {
    setBusy(true);
    try {
      await fetch(`/api/fleet/nodes/${nodeId}/servermon/restart`, { method: 'POST' });
      toast({
        title: 'Restart queued',
        description: 'The agent will restart ServerMon shortly.',
        variant: 'default',
      });
    } finally {
      setBusy(false);
    }
  };

  const createRouteIfHealthy = async (routeIntent: RouteIntent | null) => {
    if (!routeIntent) return;
    const latest = await load();
    if (!latest?.servermon.installed || latest.servermon.healthStatus !== 'healthy') return;
    const res = await fetch('/api/fleet/routes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(routeIntent),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Route setup failed with HTTP ${res.status}`);
    }
    toast({
      title: 'Public route created',
      description: routeIntent.domain,
      variant: 'success',
    });
    await load();
  };

  const startInstall = async () => {
    setMongoError(null);
    if (!mongoUri.trim()) {
      setMongoError('MongoDB URI is required');
      return;
    }
    setBusy(true);
    const startedAt = new Date().toISOString();
    setInstallLogStartedAt(startedAt);
    setInstallCommandId(null);
    setInstallLogs([]);
    setInstallLogsError(null);
    setInstallLogPolling(true);
    try {
      const res = await fetch(`/api/fleet/nodes/${nodeId}/servermon/install`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mongoUri,
          port,
          skipMongo,
          allowRoot: true,
          createPublicRoute,
          routeDomain: createPublicRoute ? routeDomain : undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        commandId?: string;
        routeIntent?: RouteIntent | null;
      };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      const commandId = typeof body.commandId === 'string' ? body.commandId : null;
      setInstallCommandId(commandId);
      toast({
        title: 'Install queued',
        description: 'The agent will start the ServerMon installer on its next heartbeat.',
        variant: 'success',
      });
      await loadInstallLogs(startedAt, commandId);
      await createRouteIfHealthy(createPublicRoute ? (body.routeIntent ?? null) : null);
    } catch (err) {
      setInstallLogPolling(false);
      toast({
        title: 'Install failed',
        description: err instanceof Error ? err.message : 'Unable to queue install',
        variant: 'destructive',
      });
      setError(err instanceof Error ? err.message : 'Unable to queue install');
    } finally {
      setBusy(false);
    }
  };

  if (!data && !error) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div
        role="alert"
        className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
      >
        {error}
      </div>
    );
  }

  if (!data) return null;
  const { servermon, route } = data;

  if (servermon.installed) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4" aria-hidden="true" />
              ServerMon on this node
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={busy} onClick={queueRecheck}>
                <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Recheck
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={queueRestart}>
                <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                Restart
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <StatusCell label="Service">
              <Badge variant={statusVariant(servermon.serviceState)}>
                {servermon.serviceState}
              </Badge>
            </StatusCell>
            <StatusCell label="Health">
              <Badge variant={statusVariant(servermon.healthStatus)}>
                {servermon.healthStatus}
              </Badge>
            </StatusCell>
            <StatusCell label="Local port">{servermon.port}</StatusCell>
            <StatusCell label="Enabled">
              {servermon.serviceEnabled === 'unknown'
                ? 'unknown'
                : servermon.serviceEnabled
                  ? 'yes'
                  : 'no'}
            </StatusCell>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Public Route</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {route ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-mono text-xs">{route.domain}</div>
                  <div className="mt-1 flex gap-2">
                    <Badge variant={statusVariant(route.status)}>{route.status}</Badge>
                    {route.healthStatus && (
                      <Badge variant={statusVariant(route.healthStatus)}>
                        {route.healthStatus}
                      </Badge>
                    )}
                  </div>
                </div>
                <a
                  href={publicRouteUrl(route)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open ServerMon public route"
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-accent"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Open ServerMon
                </a>
              </div>
            ) : (
              <div className="text-muted-foreground">No ServerMon public route is configured.</div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Server className="h-4 w-4" aria-hidden="true" />
          Install ServerMon
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!data.canInstall && (
          <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            The agent must be connected before ServerMon can be installed.
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="MongoDB URI"
            value={mongoUri}
            error={mongoError ?? undefined}
            placeholder="mongodb://host:27017/servermon"
            onChange={(event) => setMongoUri(event.target.value)}
          />
          <Input
            label="Port"
            type="number"
            value={port}
            onChange={(event) => setPort(Number(event.target.value) || 8912)}
          />
        </div>

        <label className="flex min-h-[44px] items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={skipMongo}
            onChange={(event) => setSkipMongo(event.target.checked)}
            className="h-4 w-4"
          />
          Use remote MongoDB and skip local MongoDB install
        </label>

        <label className="flex min-h-[44px] items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={createPublicRoute}
            onChange={(event) => setCreatePublicRoute(event.target.checked)}
            className="h-4 w-4"
            aria-label="Create public route"
          />
          Create public route
        </label>

        {createPublicRoute && (
          <Input
            label="Route domain"
            value={routeDomain}
            onChange={(event) => setRouteDomain(event.target.value)}
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy || !data.canInstall} loading={busy} onClick={startInstall}>
            Start install
          </Button>
          <Button variant="outline" disabled={busy} onClick={queueRecheck}>
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Recheck
          </Button>
        </div>

        {installLogStartedAt && (
          <InstallLogsPanel
            logs={installLogs}
            error={installLogsError}
            polling={installLogPolling}
          />
        )}
      </CardContent>
    </Card>
  );
}

function StatusCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 text-sm font-medium">{children}</div>
    </div>
  );
}

function InstallLogsPanel({
  logs,
  error,
  polling,
}: {
  logs: InstallLogEvent[];
  error: string | null;
  polling: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="text-sm font-medium">Install logs</div>
        <Badge variant={polling ? 'default' : 'outline'}>{polling ? 'running' : 'idle'}</Badge>
      </div>
      <div className="max-h-72 overflow-auto p-3">
        {error && (
          <div
            role="alert"
            className="mb-2 rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"
          >
            {error}
          </div>
        )}
        {logs.length === 0 ? (
          <div className="font-mono text-xs text-muted-foreground">Waiting for agent output...</div>
        ) : (
          <div className="space-y-2">
            {logs.map((event) => (
              <div key={event._id} className="grid gap-1 text-xs md:grid-cols-[7rem_5rem_1fr]">
                <div className="font-mono text-muted-foreground">
                  {event.createdAt ? new Date(event.createdAt).toLocaleTimeString() : '--:--:--'}
                </div>
                <div>
                  <Badge variant={logLevelVariant(event.level)}>{event.level}</Badge>
                </div>
                <div className="min-w-0">
                  <div className="font-mono text-muted-foreground">{event.eventType}</div>
                  <div className="mt-0.5 whitespace-pre-wrap break-words font-mono text-foreground">
                    {event.message}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
