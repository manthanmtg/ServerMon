'use client';
import { useCallback, useEffect, useRef, useState, memo } from 'react';
import { deriveNodeStatus } from '@/lib/fleet/status';
import { useFleetStream } from '../lib/useFleetStream';
import { type ServiceState } from '@/lib/fleet/enums';

interface RawNode {
  status: string;
  tunnelStatus: string;
  lastSeen?: string;
  maintenance?: { enabled: boolean };
  pairingVerifiedAt?: string | null;
}

export const FleetStatsBanner = memo(function FleetStatsBanner({
  pollMs = 30000,
}: {
  pollMs?: number;
}) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [hubState, setHubState] = useState<ServiceState | 'unknown'>('unknown');
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Load Nodes
      const nodeRes = await fetch('/api/fleet/nodes?limit=200').catch(() => null);
      if (nodeRes && nodeRes.ok && !cancelled) {
        const data = await nodeRes.json();
        const now = new Date();
        const c: Record<string, number> = { total: 0 };
        for (const n of (data.nodes ?? []) as RawNode[]) {
          const s = deriveNodeStatus({
            lastSeen: n.lastSeen ? new Date(n.lastSeen) : undefined,
            tunnelStatus: n.tunnelStatus as never,
            maintenanceEnabled: n.maintenance?.enabled,
            unpaired: !n.pairingVerifiedAt,
            now,
          });
          c[s] = (c[s] ?? 0) + 1;
          c.total++;
        }
        setCounts(c);
      }

      // Load Hub State
      const hubRes = await fetch('/api/fleet/server').catch(() => null);
      if (hubRes && hubRes.ok && !cancelled) {
        const data = await hubRes.json();
        setHubState(data.state?.runtimeState || 'unknown');
      }
    };
    refreshRef.current = () => {
      if (!cancelled) void load();
    };
    load();
    const iv = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [pollMs]);

  const onStreamEvent = useCallback(
    (ev: { kind: string; at: string; data: Record<string, unknown> }) => {
      if (
        ev.kind === 'node.heartbeat' ||
        ev.kind === 'node.status_change' ||
        ev.kind === 'frp.state_change'
      ) {
        refreshRef.current();
      }
    },
    []
  );

  useFleetStream({ onEvent: onStreamEvent });

  const hubTone =
    hubState === 'running'
      ? 'success'
      : hubState === 'starting'
        ? 'info'
        : hubState === 'failed'
          ? 'danger'
          : 'muted';

  return (
    <div className="flex flex-wrap gap-4 items-center p-4 rounded-lg border border-border bg-card/50">
      <Stat label="Hub Status" value={hubState.toUpperCase()} tone={hubTone} />
      <div className="w-px h-8 bg-border mx-2 hidden sm:block" />
      <Stat label="Total Nodes" value={counts.total ?? 0} />
      <Stat label="Online" value={counts.online ?? 0} tone="success" />
      <Stat label="Connecting" value={counts.connecting ?? 0} tone="info" />
      <Stat label="Offline" value={counts.offline ?? 0} tone="danger" />
      <Stat label="Error" value={counts.error ?? 0} tone="danger" />
    </div>
  );
});

const Stat = memo(function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'muted';
}) {
  const color =
    tone === 'success'
      ? 'text-[color:var(--success,#16a34a)]'
      : tone === 'warning'
        ? 'text-[color:var(--warning,#d97706)]'
        : tone === 'danger'
          ? 'text-destructive'
          : tone === 'info'
            ? 'text-primary'
            : tone === 'muted'
              ? 'text-muted-foreground'
              : '';
  return (
    <div className="min-w-20">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${color}`}>{value}</div>
    </div>
  );
});
