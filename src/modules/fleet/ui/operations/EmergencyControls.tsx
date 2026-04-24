'use client';
import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import {
  RotateTokenFlow,
  RotateTokenResultPanel,
  type RotateTokenResult,
} from './rotate/RotateTokenFlow';
import {
  RotateAllTokensFlow,
  RotateAllTokensResultPanel,
  type RotateAllTokenRow,
} from './rotate/RotateAllTokensFlow';

interface EmergencyEvent {
  _id: string;
  createdAt?: string;
  eventType?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

type GenericEmergencyAction =
  | 'disable_all_routes'
  | 'stop_all_terminals'
  | 'stop_all_endpoint_runs'
  | 'pause_updates'
  | 'fleet_maintenance'
  | 'stop_frps';

const ACTIONS: Array<{
  id: GenericEmergencyAction;
  label: string;
  description: string;
}> = [
  {
    id: 'disable_all_routes',
    label: 'Disable all routes',
    description: 'Set every public route to disabled.',
  },
  {
    id: 'stop_all_terminals',
    label: 'Stop all terminals',
    description: 'Terminate all active remote terminal sessions.',
  },
  {
    id: 'stop_all_endpoint_runs',
    label: 'Stop all endpoint runs',
    description: 'Cancel all in-flight custom endpoint runs.',
  },
  {
    id: 'pause_updates',
    label: 'Pause all update jobs',
    description: 'Pause every running agent update job.',
  },
  {
    id: 'fleet_maintenance',
    label: 'Fleet maintenance',
    description: 'Mark every node as in maintenance.',
  },
  {
    id: 'stop_frps',
    label: 'Stop FRP server',
    description: 'Disable the FRP server, disconnecting all agents.',
  },
];

export function EmergencyControls() {
  const [events, setEvents] = useState<EmergencyEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<GenericEmergencyAction | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const [singleOpen, setSingleOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const [singleResult, setSingleResult] = useState<RotateTokenResult | null>(null);
  const [allResults, setAllResults] = useState<RotateAllTokenRow[] | null>(null);

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/fleet/logs?audit=true&eventType=emergency&limit=20');
      if (!res.ok) return;
      const data = await res.json();
      setEvents(data.events ?? []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const confirm = async () => {
    if (!pending) return;
    if (reason.trim().length < 10) {
      setError('Reason must be at least 10 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/fleet/emergency', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: pending,
          confirm: true,
          reason: reason.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setPending(null);
      setReason('');
      await loadEvents();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Emergency controls</CardTitle>
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
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {ACTIONS.map((a) => (
              <div
                key={a.id}
                className="rounded border border-destructive/20 p-3 space-y-2 bg-destructive/5"
              >
                <h3 className="text-sm font-medium">{a.label}</h3>
                <p className="text-xs text-muted-foreground">{a.description}</p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setPending(a.id);
                    setReason('');
                    setError(null);
                  }}
                >
                  Trigger
                </Button>
              </div>
            ))}
            <div className="rounded border border-destructive/20 p-3 space-y-2 bg-destructive/5">
              <h3 className="text-sm font-medium">Rotate agent token</h3>
              <p className="text-xs text-muted-foreground">
                Reissue the pairing token for a single node.
              </p>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setSingleOpen(true);
                  setError(null);
                }}
              >
                Rotate single
              </Button>
            </div>
            <div className="rounded border border-destructive/40 p-3 space-y-2 bg-destructive/10">
              <h3 className="text-sm font-medium text-destructive">Rotate ALL agent tokens</h3>
              <p className="text-xs text-muted-foreground">
                Reissue pairing tokens for every node. Agents will stop working until re-paired.
              </p>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setAllOpen(true);
                  setError(null);
                }}
              >
                Rotate all
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {pending && (
        <Card>
          <CardHeader>
            <CardTitle>Confirm: {pending}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This action is immediate and affects the whole fleet. Provide a reason (min 10
              characters) for the audit log.
            </p>
            <label className="block text-sm font-medium">
              Reason
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm"
                rows={3}
                placeholder="Describe why this emergency action is needed..."
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPending(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirm}
                disabled={busy || reason.trim().length < 10}
                loading={busy}
              >
                Execute
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <RotateTokenFlow
        open={singleOpen}
        onClose={() => setSingleOpen(false)}
        onResult={(result) => {
          setSingleResult(result);
          loadEvents();
        }}
      />
      {singleResult && (
        <RotateTokenResultPanel result={singleResult} onDismiss={() => setSingleResult(null)} />
      )}

      <RotateAllTokensFlow
        open={allOpen}
        onClose={() => setAllOpen(false)}
        onResult={(rows) => {
          setAllResults(rows);
          loadEvents();
        }}
      />
      {allResults && (
        <RotateAllTokensResultPanel rows={allResults} onDismiss={() => setAllResults(null)} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent emergency actions</CardTitle>
        </CardHeader>
        <CardContent>
          {!events && (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          )}
          {events && events.length === 0 && (
            <p className="text-sm text-muted-foreground">No emergency audit events.</p>
          )}
          {events && events.length > 0 && (
            <ul className="space-y-2 text-sm">
              {events.map((ev) => (
                <li key={ev._id} className="rounded border border-border p-2 text-xs space-y-0.5">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">{ev.eventType ?? 'event'}</Badge>
                    <span className="text-muted-foreground">
                      {ev.createdAt ? new Date(ev.createdAt).toLocaleString() : ''}
                    </span>
                  </div>
                  <div>{ev.message ?? ''}</div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
