'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ServerCog } from 'lucide-react';
import { deriveNodeStatus } from '@/lib/fleet/status';

interface NodeSummary {
  _id: string;
  status: string;
  tunnelStatus: string;
  lastSeen?: string;
  maintenance?: { enabled: boolean };
  pairingVerifiedAt?: string | null;
}

export default function FleetWidget() {
  const [nodes, setNodes] = useState<NodeSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/fleet/nodes?limit=200');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setNodes(data.nodes ?? []);
      } catch (e: unknown) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    load();
    const iv = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  const now = new Date();
  const counts = nodes.reduce(
    (acc, n) => {
      const s = deriveNodeStatus({
        lastSeen: n.lastSeen ? new Date(n.lastSeen) : undefined,
        tunnelStatus: n.tunnelStatus as never,
        maintenanceEnabled: n.maintenance?.enabled,
        unpaired: !n.pairingVerifiedAt,
        now,
      });
      acc[s] = (acc[s] ?? 0) + 1;
      acc.total++;
      return acc;
    },
    { total: 0 } as Record<string, number>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <ServerCog className="h-5 w-5 text-primary" />
          <CardTitle>Fleet Overview</CardTitle>
        </div>
        <Link href="/fleet" className="text-sm text-primary underline-offset-4 hover:underline">
          View fleet
        </Link>
      </CardHeader>
      <CardContent>
        {error && <div className="text-sm text-destructive">{error}</div>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <StatCell label="Total" value={counts.total} />
          <StatCell label="Online" value={counts.online ?? 0} variant="success" />
          <StatCell label="Degraded" value={counts.degraded ?? 0} variant="warning" />
          <StatCell label="Offline" value={counts.offline ?? 0} variant="destructive" />
        </div>
      </CardContent>
    </Card>
  );
}

function StatCell({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant?: 'success' | 'warning' | 'destructive';
}) {
  const color =
    variant === 'success'
      ? 'text-[color:var(--success,#16a34a)]'
      : variant === 'warning'
        ? 'text-[color:var(--warning,#d97706)]'
        : variant === 'destructive'
          ? 'text-destructive'
          : '';
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}
