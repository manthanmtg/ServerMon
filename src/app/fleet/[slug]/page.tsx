'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import ProShell from '@/components/layout/ProShell';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { NodeStatusPanel } from '@/modules/fleet/ui/details/NodeStatusPanel';
import { ProxyRuleTable } from '@/modules/fleet/ui/details/ProxyRuleTable';
import { PublicRouteTable } from '@/modules/fleet/ui/details/PublicRouteTable';
import { NodeLogsView } from '@/modules/fleet/ui/details/NodeLogsView';
import { NodeHardwareCharts } from '@/modules/fleet/ui/details/NodeHardwareCharts';
import { NodeTerminal } from '@/modules/fleet/ui/details/NodeTerminal';
import { RemoteProcessTable } from '@/modules/fleet/ui/details/RemoteProcessTable';

type Tab = 'overview' | 'terminal' | 'proxies' | 'routes' | 'processes' | 'logs' | 'hardware';

export default function NodeDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';
  const [tab, setTab] = useState<Tab>('overview');
  const [node, setNode] = useState<{
    _id: string;
    name: string;
    slug: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/fleet/nodes?search=${encodeURIComponent(slug)}&limit=5`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const match = (data.nodes ?? []).find((n: { slug: string }) => n.slug === slug);
        if (cancelled) return;
        if (!match) {
          setError('Node not found');
          return;
        }
        setNode({ _id: match._id, name: match.name, slug: match.slug });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (error)
    return (
      <ProShell title="Fleet">
        <div className="text-sm text-destructive">{error}</div>
      </ProShell>
    );
  if (!node)
    return (
      <ProShell title="Fleet">
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      </ProShell>
    );

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'terminal', label: 'Terminal' },
    { id: 'proxies', label: 'Proxies' },
    { id: 'routes', label: 'Public Routes' },
    { id: 'processes', label: 'Processes' },
    { id: 'logs', label: 'Logs' },
    { id: 'hardware', label: 'Hardware' },
  ];

  return (
    <ProShell title={node.name} subtitle={node.slug}>
      <div className="space-y-4">
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'px-3 py-2 text-sm border-b-2 whitespace-nowrap transition-colors',
                tab === t.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'overview' && <NodeStatusPanel nodeId={node._id} />}
        {tab === 'terminal' && <NodeTerminal nodeId={node._id} />}
        {tab === 'proxies' && <ProxyRuleTable nodeId={node._id} />}
        {tab === 'routes' && <PublicRouteTable nodeId={node._id} />}
        {tab === 'processes' && <RemoteProcessTable nodeId={node._id} />}
        {tab === 'logs' && <NodeLogsView nodeId={node._id} />}
        {tab === 'hardware' && <NodeHardwareCharts nodeId={node._id} />}
      </div>
    </ProShell>
  );
}
