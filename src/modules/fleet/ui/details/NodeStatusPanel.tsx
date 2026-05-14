'use client';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { deriveNodeTransition, lastSeenLabel } from '@/lib/fleet/status';
import type { TunnelStatus } from '@/lib/fleet/enums';
import type { ReconcileReport } from '@/lib/fleet/reconcile';
import { useFleetStream } from '../lib/useFleetStream';
import { useToast } from '@/components/ui/toast';
import { AutoscrollButton } from '@/components/ui/AutoscrollButton';

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

interface AgentUpdateLogEvent {
  _id: string;
  createdAt?: string;
  service?: string;
  level: string;
  eventType: string;
  message: string;
  metadata?: { commandId?: unknown };
}

function logLevelVariant(level: string): BadgeVariant {
  if (level === 'error') return 'destructive';
  if (level === 'warn') return 'warning';
  return 'outline';
}

function isAgentUpdateEvent(event: AgentUpdateLogEvent): boolean {
  return event.eventType.startsWith('agent.update.');
}

function isTerminalAgentUpdateEvent(event: AgentUpdateLogEvent): boolean {
  return event.eventType === 'agent.update.succeeded' || event.eventType === 'agent.update.failed';
}

function logEventTime(event: AgentUpdateLogEvent): number {
  if (!event.createdAt) return 0;
  const time = new Date(event.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function shouldReplaceAgentUpdateLogs(
  current: AgentUpdateLogEvent[],
  next: AgentUpdateLogEvent[]
): boolean {
  if (current.length !== next.length) return true;
  return current.some((event, index) => {
    const nextEvent = next[index];
    return (
      event._id !== nextEvent._id ||
      event.createdAt !== nextEvent.createdAt ||
      event.level !== nextEvent.level ||
      event.eventType !== nextEvent.eventType ||
      event.message !== nextEvent.message
    );
  });
}

export function NodeStatusPanel({ nodeId }: { nodeId: string }) {
  const { toast } = useToast();
  const [node, setNode] = useState<Node | null>(null);
  const [computedStatus, setComputedStatus] = useState<string>('unknown');
  const [busy, setBusy] = useState(false);
  const [reconcileReport, setReconcileReport] = useState<ReconcileReport | null>(null);
  const [reconcileBusy, setReconcileBusy] = useState(false);
  const [updateLogStartedAt, setUpdateLogStartedAt] = useState<string | null>(null);
  const [updateCommandId, setUpdateCommandId] = useState<string | null>(null);
  const [updateLogs, setUpdateLogs] = useState<AgentUpdateLogEvent[]>([]);
  const [updateLogsError, setUpdateLogsError] = useState<string | null>(null);
  const [updateLogPolling, setUpdateLogPolling] = useState(false);
  const refreshRef = useRef<() => void>(() => {});

  const loadUpdateLogs = useCallback(
    async (startedAt: string, commandId: string | null) => {
      try {
        const params = new URLSearchParams({
          nodeId,
          service: 'agent',
          since: startedAt,
          limit: '100',
        });
        const res = await fetch(`/api/fleet/logs?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { events?: AgentUpdateLogEvent[] };
        const events = (body.events ?? [])
          .filter(isAgentUpdateEvent)
          .filter((event) => {
            if (!commandId) return true;
            const eventCommandId = event.metadata?.commandId;
            return eventCommandId == null || String(eventCommandId) === commandId;
          })
          .sort((a, b) => logEventTime(a) - logEventTime(b));
        setUpdateLogs((current) =>
          shouldReplaceAgentUpdateLogs(current, events) ? events : current
        );
        setUpdateLogsError(null);
        setUpdateLogPolling(!events.some(isTerminalAgentUpdateEvent));
      } catch (err) {
        setUpdateLogsError(err instanceof Error ? err.message : 'Failed to load update logs');
      }
    },
    [nodeId]
  );

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

  useEffect(() => {
    if (!updateLogStartedAt || !updateLogPolling) return;
    const iv = setInterval(() => {
      void loadUpdateLogs(updateLogStartedAt, updateCommandId);
    }, 2500);
    return () => clearInterval(iv);
  }, [loadUpdateLogs, updateCommandId, updateLogPolling, updateLogStartedAt]);

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

  const runUpdate = async () => {
    const startedAt = new Date(Date.now() - 5000).toISOString();
    setUpdateLogStartedAt(startedAt);
    setUpdateCommandId(null);
    setUpdateLogs([]);
    setUpdateLogsError(null);
    setUpdateLogPolling(true);
    setBusy(true);
    try {
      const res = await fetch(`/api/fleet/nodes/${nodeId}/updates`, { method: 'POST' });
      if (res.ok) {
        const body = (await res.json().catch(() => ({}))) as { commandId?: unknown };
        const commandId = typeof body.commandId === 'string' ? body.commandId : null;
        setUpdateCommandId(commandId);
        toast({
          title: 'Update Queued',
          description: 'The update command will be received on the next heartbeat (within 30s).',
          variant: 'success',
        });
        void loadUpdateLogs(startedAt, commandId);
      } else {
        throw new Error('Failed to queue update');
      }
    } catch (err) {
      toast({
        title: 'Update Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
      setUpdateLogPolling(false);
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
            <div className="flex flex-wrap gap-2">
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
              <Button variant="outline" disabled={busy} onClick={runUpdate}>
                Update Agent
              </Button>
            </div>
            {updateLogStartedAt && (
              <AgentUpdateLogsPanel
                logs={updateLogs}
                error={updateLogsError}
                polling={updateLogPolling}
              />
            )}
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
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-0.5">
      <span className="text-muted-foreground text-xs sm:text-sm whitespace-nowrap">{label}</span>
      <span className="text-right text-xs sm:text-sm font-medium break-all">{children}</span>
    </div>
  );
}

const AgentUpdateLogsPanel = memo(function AgentUpdateLogsPanel({
  logs,
  error,
  polling,
}: {
  logs: AgentUpdateLogEvent[];
  error: string | null;
  polling: boolean;
}) {
  const [autoscroll, setAutoscroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!autoscroll) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [autoscroll, logs]);

  return (
    <div className="rounded-lg border border-border bg-muted/20">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="text-sm font-medium">Agent update logs</div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge variant={polling ? 'default' : 'outline'}>{polling ? 'running' : 'idle'}</Badge>
          <AutoscrollButton
            enabled={autoscroll}
            onToggle={setAutoscroll}
            aria-label="Agent update log autoscroll"
            className="h-8 px-2"
          />
        </div>
      </div>
      <div ref={scrollRef} className="max-h-72 overflow-auto p-3">
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
});
