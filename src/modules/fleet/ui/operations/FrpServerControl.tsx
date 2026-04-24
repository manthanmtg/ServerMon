'use client';
import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import ConfirmationModal from '@/components/ui/ConfirmationModal';

interface FrpServerState {
  enabled: boolean;
  runtimeState: string;
  bindPort: number;
  vhostHttpPort: number;
  vhostHttpsPort?: number;
  subdomainHost?: string;
  generatedConfigHash?: string;
  configVersion: number;
  lastRestartAt?: string;
  lastError?: { code: string; message: string; occurredAt: string };
  activeConnections: number;
  connectedNodeIds: string[];
}

type PendingAction =
  | { kind: 'toggle'; enabled: boolean; force?: boolean }
  | { kind: 'restart' }
  | null;

export function FrpServerControl() {
  const [state, setState] = useState<FrpServerState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<{
    activeConnections: number;
    connectedNodeIds: string[];
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/fleet/server');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setState(data.state ?? null);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [load]);

  const doToggle = async (enabled: boolean, force: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/fleet/server', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled, force }),
      });
      if (res.status === 409) {
        const body = await res.json();
        setBlocked({
          activeConnections: body.activeConnections ?? 0,
          connectedNodeIds: body.connectedNodeIds ?? [],
        });
        setPending(null);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setState(data.state ?? null);
      setPending(null);
      setBlocked(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doRestart = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/fleet/server/restart', {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setState(data.state ?? null);
      setPending(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirmAction = async () => {
    if (!pending) return;
    if (pending.kind === 'toggle') {
      await doToggle(pending.enabled, pending.force === true);
    } else if (pending.kind === 'restart') {
      await doRestart();
    }
  };

  if (!state) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>FRP Server</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <div
              role="alert"
              className="rounded border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive"
            >
              {error}
            </div>
          ) : (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const blastRadiusDesc =
    `${state.activeConnections} active connection(s), ` +
    `${state.connectedNodeIds.length} connected node(s).`;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>FRP Server</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={state.enabled ? 'success' : 'outline'}>
              {state.enabled ? 'enabled' : 'disabled'}
            </Badge>
            <Badge variant="outline">{state.runtimeState}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {error && (
            <div
              role="alert"
              className="rounded border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive"
            >
              {error}
            </div>
          )}
          <Row label="Bind port">{state.bindPort}</Row>
          <Row label="vhost HTTP port">{state.vhostHttpPort}</Row>
          <Row label="vhost HTTPS port">{state.vhostHttpsPort ?? '—'}</Row>
          <Row label="Subdomain host">{state.subdomainHost ?? '—'}</Row>
          <Row label="Config version">{state.configVersion}</Row>
          <Row label="Generated config hash">
            <span className="font-mono text-xs">{state.generatedConfigHash ?? '—'}</span>
          </Row>
          <Row label="Last restart">
            {state.lastRestartAt ? new Date(state.lastRestartAt).toLocaleString() : '—'}
          </Row>
          <Row label="Active connections">{state.activeConnections}</Row>
          <Row label="Connected nodes">{state.connectedNodeIds.length}</Row>
          {state.lastError && (
            <div className="rounded border border-destructive/30 bg-destructive/5 p-2 text-xs">
              <div className="font-mono text-destructive">{state.lastError.code}</div>
              <div>{state.lastError.message}</div>
            </div>
          )}
          <div className="flex gap-2 pt-2 flex-wrap">
            <Button
              variant={state.enabled ? 'destructive' : 'default'}
              disabled={busy}
              onClick={() => setPending({ kind: 'toggle', enabled: !state.enabled })}
            >
              {state.enabled ? 'Disable FRP server' : 'Enable FRP server'}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setPending({ kind: 'restart' })}
            >
              Restart
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmationModal
        isOpen={pending?.kind === 'toggle'}
        onCancel={() => setPending(null)}
        onConfirm={confirmAction}
        title={
          pending?.kind === 'toggle' && pending.enabled
            ? 'Enable FRP server?'
            : 'Disable FRP server?'
        }
        message={
          pending?.kind === 'toggle' && !pending.enabled
            ? `This will disconnect ${blastRadiusDesc}`
            : 'This will start the FRP server.'
        }
        confirmLabel={pending?.kind === 'toggle' && pending.enabled ? 'Enable' : 'Disable'}
        variant={pending?.kind === 'toggle' && !pending.enabled ? 'danger' : 'info'}
        isLoading={busy}
      />

      <ConfirmationModal
        isOpen={pending?.kind === 'restart'}
        onCancel={() => setPending(null)}
        onConfirm={confirmAction}
        title="Restart FRP server?"
        message={`This will drop and reconnect ${blastRadiusDesc}`}
        confirmLabel="Restart"
        variant="warning"
        isLoading={busy}
      />

      {blocked && (
        <Card>
          <CardHeader>
            <CardTitle>Disable blocked</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              The FRP server has {blocked.activeConnections} active connection(s). Use force disable
              to terminate anyway.
            </p>
            <div className="flex gap-2">
              <Button variant="destructive" disabled={busy} onClick={() => doToggle(false, true)}>
                Force disable
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setBlocked(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
