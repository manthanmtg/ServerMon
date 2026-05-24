'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import ProShell from '@/components/layout/ProShell';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { NodeStatusPanel } from '@/modules/fleet/ui/details/NodeStatusPanel';
import { NodeServerMonPanel } from '@/modules/fleet/ui/details/NodeServerMonPanel';
import { ProxyRuleTable } from '@/modules/fleet/ui/details/ProxyRuleTable';
import { PublicRouteTable } from '@/modules/fleet/ui/details/PublicRouteTable';
import { NodeLogsView } from '@/modules/fleet/ui/details/NodeLogsView';
import { NodeHardwareCharts } from '@/modules/fleet/ui/details/NodeHardwareCharts';
import { NodeTerminal } from '@/modules/fleet/ui/details/NodeTerminal';
import { RemoteProcessTable } from '@/modules/fleet/ui/details/RemoteProcessTable';

type Tab =
  | 'overview'
  | 'servermon'
  | 'terminal'
  | 'proxies'
  | 'routes'
  | 'processes'
  | 'logs'
  | 'hardware';

import { resilientFetch } from '@/lib/fetch-utils';

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
        const res = await resilientFetch(`/api/fleet/nodes/by-slug/${encodeURIComponent(slug)}`, {
          timeout: 8000,
          retries: 2,
        });
        if (!res.ok) {
          if (res.status === 404) throw new Error('Node not found');
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (cancelled) return;
        setNode({ _id: data._id, name: data.name, slug: data.slug });
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
    { id: 'servermon', label: 'ServerMon' },
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
        <div role="tablist" aria-label="Node detail tabs" className="flex gap-1 border-b border-border overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              id={`node-tab-${node._id}-${t.id}`}
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`node-tabpanel-${node._id}-${t.id}`}
              type="button"
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
        <div
          id={`node-tabpanel-${node._id}-overview`}
          role="tabpanel"
          aria-labelledby={`node-tab-${node._id}-overview`}
          className={tab === 'overview' ? 'block' : 'hidden'}
        >
          <NodeStatusPanel nodeId={node._id} />
        </div>
        <div
          id={`node-tabpanel-${node._id}-servermon`}
          role="tabpanel"
          aria-labelledby={`node-tab-${node._id}-servermon`}
          className={tab === 'servermon' ? 'block' : 'hidden'}
        >
          <NodeServerMonPanel nodeId={node._id} />
        </div>
        <div
          id={`node-tabpanel-${node._id}-terminal`}
          role="tabpanel"
          aria-labelledby={`node-tab-${node._id}-terminal`}
          className={tab === 'terminal' ? 'block' : 'hidden'}
        >
          <NodeTerminal nodeId={node._id} />
        </div>
        <div
          id={`node-tabpanel-${node._id}-proxies`}
          role="tabpanel"
          aria-labelledby={`node-tab-${node._id}-proxies`}
          hidden={tab !== 'proxies'}
        >
          <ProxyRuleTable nodeId={node._id} />
        </div>
        <div
          id={`node-tabpanel-${node._id}-routes`}
          role="tabpanel"
          aria-labelledby={`node-tab-${node._id}-routes`}
          hidden={tab !== 'routes'}
        >
          <PublicRouteTable nodeId={node._id} />
        </div>
        <div
          id={`node-tabpanel-${node._id}-processes`}
          role="tabpanel"
          aria-labelledby={`node-tab-${node._id}-processes`}
          hidden={tab !== 'processes'}
        >
          <RemoteProcessTable nodeId={node._id} />
        </div>
        <div
          id={`node-tabpanel-${node._id}-logs`}
          role="tabpanel"
          aria-labelledby={`node-tab-${node._id}-logs`}
          hidden={tab !== 'logs'}
        >
          <NodeLogsView nodeId={node._id} />
        </div>
        <div
          id={`node-tabpanel-${node._id}-hardware`}
          role="tabpanel"
          aria-labelledby={`node-tab-${node._id}-hardware`}
          hidden={tab !== 'hardware'}
        >
          <NodeHardwareCharts nodeId={node._id} />
        </div>
      </div>
    </ProShell>
  );
}
