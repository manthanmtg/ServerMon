'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { deriveNodeTransition, lastSeenLabel } from '@/lib/fleet/status';
import type { TunnelStatus } from '@/lib/fleet/enums';
import type { ReconcileReport } from '@/lib/fleet/reconcile';
import { useFleetStream } from '../lib/useFleetStream';

interface Node {
  _id: string;
  name: string;
  slug: string;
  status: string;
  tunnelStatus: string;
  lastSeen?: string;
  lastBootAt?: string;
  connectedSince?: string;
  agentVersion?: string;
  frpcVersion?: string;
  serviceManager?: string;
  serviceStatus?: string;
  lastError?: { code: string; message: string; occurredAt: string };
  hardware?: {
    cpuCount?: number;
    totalRam?: number;
    osDistro?: string;
    arch?: string;
  };
  capabilities?: Record<string, boolean>;
  maintenance?: { enabled: boolean; reason?: string };
  proxyRules?: Array<{ name: string; enabled: boolean; status: string }>;
  tags?: string[];
}

export function NodeStatusPanel({ nodeId }: { nodeId: string }) {
  const [node, setNode] = useState<Node | null>(null);
  const [computedStatus, setComputedStatus] = useState<string>('unknown');
  const [busy, setBusy] = useState(false);
  const [reconcileReport, setReconcileReport] = useState<ReconcileReport | null>(null);
  const [reconcileBusy, setReconcileBusy] = useState(false);
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/fleet/nodes/${nodeId}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setNode(data.node ?? data);
        setComputedStatus(data.computedStatus ?? data.node?.status ?? 'unknown');
      } catch {
        // ignore polling errors
      }
    };
    refreshRef.current = () => {
      if (!cancelled) void load();
    };
    load();
    const iv = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [nodeId]);

  const onStreamEvent = useCallback(
    (ev: { kind: string; at: string; data: Record<string, unknown> }) => {
      if (
        ev.kind === 'node.heartbeat' ||
        ev.kind === 'node.status_change' ||
        ev.kind === 'node.reboot'
      ) {
        refreshRef.current();
      }
    },
    []
  );

  useFleetStream({ nodeId, onEvent: onStreamEvent });

  const toggleMaintenance = async (enabled: boolean) => {
    setBusy(true);
    try {
      await fetch(`/api/fleet/nodes/${nodeId}/maintenance`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled,
          reason: enabled ? 'Manual pause from UI' : undefined,
        }),
      });
    } finally {
      setBusy(false);
    }
  };

  const runDiagnose = async () => {
    setBusy(true);
    try {
      await fetch(`/api/fleet/nodes/${nodeId}/diagnose`, { method: 'POST' });
    } finally {
      setBusy(false);
    }
  };

  const runReconcile = async () => {
    setReconcileBusy(true);
    try {
      const res = await fetch(`/api/fleet/nodes/${nodeId}/reconcile`, { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as { report?: ReconcileReport };
        if (data.report) setReconcileReport(data.report);
      }
    } finally {
      setReconcileBusy(false);
    }
  };

  if (!node)
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );

  const transition = deriveNodeTransition({
    lastBootAt: node.lastBootAt ? new Date(node.lastBootAt) : undefined,
    lastSeen: node.lastSeen ? new Date(node.lastSeen) : undefined,
    tunnelStatus: node.tunnelStatus as TunnelStatus,
    proxyRules: node.proxyRules,
    now: new Date(),
  });

  return (
    <div className="space-y-4">
      {transition && (
        <Card data-testid="reboot-banner" className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
              <span className="font-medium">Recent reboot detected</span>
              <Badge variant="outline">{transition.replace('_', ' ')}</Badge>
            </div>
            <Button variant="outline" size="sm" disabled={reconcileBusy} onClick={runReconcile}>
              {reconcileBusy ? 'Running…' : 'Run reconcile'}
            </Button>
          </CardContent>
          {reconcileReport && (
            <CardContent className="pt-0 text-xs">
              <div className="mb-1 font-medium">
                {reconcileReport.healthy ? 'All checks healthy' : 'Issues found:'}
              </div>
              {reconcileReport.gaps.length === 0 ? (
                <div className="text-muted-foreground">No gaps reported.</div>
              ) : (
                <ul className="space-y-1">
                  {reconcileReport.gaps.map((g) => (
                    <li key={g.id} className="flex gap-2">
                      <Badge
                        variant="outline"
                        className={
                          g.severity === 'error'
                            ? 'border-destructive/50 text-destructive'
                            : g.severity === 'warn'
                              ? 'border-amber-500/50 text-amber-600'
                              : ''
                        }
                      >
                        {g.severity}
                      </Badge>
                      <span>
                        <span className="font-medium">{g.label}</span>
                        {g.detail && <span className="text-muted-foreground"> — {g.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          )}
        </Card>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Computed status">
              <Badge>{computedStatus}</Badge>
            </Row>
            <Row label="Tunnel">{node.tunnelStatus}</Row>
            <Row label="Last seen">
              {lastSeenLabel(node.lastSeen ? new Date(node.lastSeen) : undefined, new Date())}
            </Row>
            <Row label="Connected since">
              {node.connectedSince ? new Date(node.connectedSince).toLocaleString() : '—'}
            </Row>
            <Row label="Agent version">{node.agentVersion ?? '—'}</Row>
            <Row label="FRPC version">{node.frpcVersion ?? '—'}</Row>
            <Row label="Service manager">{node.serviceManager ?? '—'}</Row>
            <Row label="Service status">{node.serviceStatus ?? '—'}</Row>
            {node.lastError && (
              <div className="mt-2 rounded border border-destructive/30 bg-destructive/5 p-2 text-xs">
                <div className="font-mono text-destructive">{node.lastError.code}</div>
                <div>{node.lastError.message}</div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => toggleMaintenance(!node.maintenance?.enabled)}
              >
                {node.maintenance?.enabled ? 'Exit maintenance' : 'Enter maintenance'}
              </Button>
              <Button variant="outline" disabled={busy} onClick={runDiagnose}>
                Run diagnose
              </Button>
            </div>
            <div className="text-sm">
              <div className="font-medium mb-1">Capabilities</div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(node.capabilities ?? {})
                  .filter(([, v]) => v)
                  .map(([k]) => (
                    <Badge key={k} variant="outline">
                      {k}
                    </Badge>
                  ))}
              </div>
            </div>
            <div className="text-sm">
              <div className="font-medium mb-1">Hardware</div>
              <div className="text-xs text-muted-foreground">
                {node.hardware?.osDistro ?? '—'} · {node.hardware?.arch ?? '—'} ·{' '}
                {node.hardware?.cpuCount ?? '—'} CPUs
              </div>
            </div>
            <div className="text-sm">
              <div className="font-medium mb-1">Tags</div>
              <div className="flex flex-wrap gap-1">
                {(node.tags ?? []).map((t) => (
                  <Badge key={t} variant="outline">
                    {t}
                  </Badge>
                ))}
                {(!node.tags || node.tags.length === 0) && (
                  <span className="text-xs text-muted-foreground">None</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
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
