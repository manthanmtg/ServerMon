'use client';
import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import ConfirmationModal from '@/components/ui/ConfirmationModal';

interface NginxState {
  managed: boolean;
  managedDir?: string;
  binaryPath?: string;
  runtimeState: string;
  lastTestAt?: string;
  lastTestOutput?: string;
  lastTestSuccess?: boolean;
  lastReloadAt?: string;
  lastReloadSuccess?: boolean;
  detectedConflicts?: Array<{
    serverName: string;
    filePath: string;
    reason: string;
  }>;
}

export function NginxManager() {
  const [state, setState] = useState<NginxState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [showReloadConfirm, setShowReloadConfirm] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/fleet/nginx');
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
  }, [load]);

  const toggleManaged = async () => {
    if (!state) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/fleet/nginx', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ managed: !state.managed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setState(data.state ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runTest = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/fleet/nginx/test', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 409) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setTestOutput(data.stderr ?? '(no output)');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doReload = async () => {
    setShowReloadConfirm(false);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/fleet/nginx/reload', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? data.stderr ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!state) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nginx</CardTitle>
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Nginx</CardTitle>
          <div className="flex gap-2">
            <Badge variant={state.managed ? 'success' : 'outline'}>
              {state.managed ? 'managed' : 'unmanaged'}
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
          <Row label="Managed dir">{state.managedDir ?? '—'}</Row>
          <Row label="Binary path">{state.binaryPath ?? '—'}</Row>
          <Row label="Last test">
            {state.lastTestAt ? new Date(state.lastTestAt).toLocaleString() : '—'}
          </Row>
          <Row label="Last reload">
            {state.lastReloadAt ? new Date(state.lastReloadAt).toLocaleString() : '—'}
          </Row>
          {state.lastTestOutput && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Last test output</div>
              <pre className="rounded border border-border bg-muted/30 p-2 text-xs overflow-auto max-h-40 whitespace-pre-wrap font-mono">
                {state.lastTestOutput}
              </pre>
            </div>
          )}
          <div className="flex gap-2 pt-2 flex-wrap">
            <Button variant="outline" disabled={busy} onClick={toggleManaged}>
              {state.managed ? 'Disable managed mode' : 'Enable managed mode'}
            </Button>
            <Button variant="outline" disabled={busy} onClick={runTest}>
              Test config
            </Button>
            <Button disabled={busy || !state.managed} onClick={() => setShowReloadConfirm(true)}>
              Reload
            </Button>
          </div>
        </CardContent>
      </Card>

      {testOutput !== null && (
        <Card>
          <CardHeader>
            <CardTitle>Test output</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="rounded border border-border bg-muted/30 p-2 text-xs overflow-auto max-h-60 whitespace-pre-wrap font-mono">
              {testOutput}
            </pre>
          </CardContent>
        </Card>
      )}

      {state.detectedConflicts && state.detectedConflicts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Detected conflicts</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {state.detectedConflicts.map((c, i) => (
                <li
                  key={`${c.serverName}-${i}`}
                  className="rounded border border-warning/30 bg-warning/5 p-2"
                >
                  <div className="font-mono text-xs">{c.serverName}</div>
                  <div className="text-xs text-muted-foreground">{c.filePath}</div>
                  <div className="text-xs">{c.reason}</div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <ConfirmationModal
        isOpen={showReloadConfirm}
        onCancel={() => setShowReloadConfirm(false)}
        onConfirm={doReload}
        title="Reload nginx?"
        message="Reloading will apply the current managed configuration. This briefly re-opens connections."
        confirmLabel="Reload"
        variant="warning"
        isLoading={busy}
      />
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
