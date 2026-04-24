'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  renderNodeDoc,
  renderRouteDoc,
  type DocsNode,
  type DocsRoute,
  type DocsRevisionBrief,
} from '@/lib/fleet/docsMarkdown';

interface DocsNodeView {
  kind: 'node';
  nodeId: string;
}

interface DocsRouteView {
  kind: 'route';
  routeId: string;
}

type Props = DocsNodeView | DocsRouteView;

interface NodeDoc {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  createdBy?: string;
  tags?: string[];
  status: string;
  tunnelStatus: string;
  proxyRules?: Array<{ name: string; type: string }>;
  generatedToml?: { hash?: string; version?: number; renderedAt?: string };
  agentVersion?: string;
}

interface RouteDoc {
  _id: string;
  name: string;
  slug: string;
  domain: string;
  nodeId: string;
  createdBy?: string;
  target: { localIp: string; localPort: number; protocol: string };
  accessMode: string;
  tlsEnabled: boolean;
  tlsStatus?: string;
  healthStatus?: string;
  dnsStatus?: string;
  nginxConfigRevisionId?: string;
}

interface LogItem {
  _id: string;
  createdAt?: string;
  eventType?: string;
  message?: string;
  level?: string;
}

interface Revision {
  _id: string;
  kind: string;
  version: number;
  hash: string;
  createdAt?: string;
  createdBy?: string;
}

function triggerDownload(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function revisionToBrief(r: Revision | null): DocsRevisionBrief[] {
  if (!r) return [];
  return [
    {
      _id: r._id,
      kind: r.kind,
      version: r.version,
      hash: r.hash,
      createdAt: r.createdAt ?? new Date().toISOString(),
      createdBy: r.createdBy,
    },
  ];
}

export function GeneratedDocsView(props: Props) {
  const [node, setNode] = useState<NodeDoc | null>(null);
  const [route, setRoute] = useState<RouteDoc | null>(null);
  const [latestRevision, setLatestRevision] = useState<Revision | null>(null);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        if (props.kind === 'node') {
          const res = await fetch(`/api/fleet/nodes/${props.nodeId}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (cancelled) return;
          setNode((data.node ?? data) as NodeDoc);

          const revRes = await fetch(
            `/api/fleet/revisions?kind=frpc&targetId=${props.nodeId}&limit=1`
          );
          if (revRes.ok) {
            const revData = await revRes.json();
            setLatestRevision(revData.revisions?.[0] ?? null);
          }

          const logsRes = await fetch(`/api/fleet/logs?nodeId=${props.nodeId}&limit=10`);
          if (logsRes.ok) {
            const logsData = await logsRes.json();
            setLogs(logsData.events ?? []);
          }
        } else {
          const res = await fetch(`/api/fleet/routes/${props.routeId}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (cancelled) return;
          setRoute((data.route ?? data) as RouteDoc);

          const revRes = await fetch(
            `/api/fleet/revisions?kind=nginx&targetId=${props.routeId}&limit=1`
          );
          if (revRes.ok) {
            const revData = await revRes.json();
            setLatestRevision(revData.revisions?.[0] ?? null);
          }

          const logsRes = await fetch(`/api/fleet/logs?routeId=${props.routeId}&limit=10`);
          if (logsRes.ok) {
            const logsData = await logsRes.json();
            setLogs(logsData.events ?? []);
          }
        }
        setError(null);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [props]);

  if (error) {
    return (
      <div
        role="alert"
        className="rounded border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive"
      >
        {error}
      </div>
    );
  }

  if (props.kind === 'node') {
    if (!node) {
      return (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      );
    }
    const handleDownloadNode = () => {
      const md = renderNodeDoc(node as unknown as DocsNode, [], revisionToBrief(latestRevision));
      triggerDownload(`${node.slug}.md`, md);
    };
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownloadNode}
            aria-label="Download node docs as Markdown"
          >
            Download as Markdown
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Purpose</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {node.description ?? 'No description provided.'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Owner</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {node.createdBy ?? '—'}
            {node.tags && node.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {node.tags.map((t) => (
                  <Badge key={t} variant="outline">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Target</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>
              <span className="text-muted-foreground">Proxies: </span>
              {(node.proxyRules ?? []).length}
            </div>
            <div>
              <span className="text-muted-foreground">Agent version: </span>
              {node.agentVersion ?? '—'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Generated config revision</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {latestRevision ? (
              <div className="space-y-1">
                <div>
                  <span className="text-muted-foreground">Version: </span>
                  {latestRevision.version}
                </div>
                <div className="font-mono text-xs">
                  <span className="text-muted-foreground">Hash: </span>
                  {latestRevision.hash}
                </div>
                <div className="text-xs text-muted-foreground">
                  {latestRevision.createdAt
                    ? new Date(latestRevision.createdAt).toLocaleString()
                    : ''}
                </div>
              </div>
            ) : (
              '—'
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Health checks</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>
              <span className="text-muted-foreground">Status: </span>
              <Badge variant="outline">{node.status}</Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Tunnel: </span>
              <Badge variant="outline">{node.tunnelStatus}</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent changes</CardTitle>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <p className="text-xs text-muted-foreground">No recent events.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {logs.map((l) => (
                  <li key={l._id}>
                    <span className="text-muted-foreground">
                      {l.createdAt ? new Date(l.createdAt).toLocaleString() : ''}{' '}
                    </span>
                    <span className="font-mono">{l.eventType}</span> {l.message}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Route docs
  if (!route) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }
  const handleDownloadRoute = () => {
    const md = renderRouteDoc(route as unknown as DocsRoute, revisionToBrief(latestRevision));
    triggerDownload(`${route.slug}.md`, md);
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDownloadRoute}
          aria-label="Download route docs as Markdown"
        >
          Download as Markdown
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Purpose</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          Public route {route.name} exposes {route.target.localIp}:{route.target.localPort} (
          {route.target.protocol}).
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Owner</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">{route.createdBy ?? '—'}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Domain</CardTitle>
        </CardHeader>
        <CardContent className="text-sm font-mono">{route.domain}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Target</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {route.target.localIp}:{route.target.localPort} · {route.target.protocol}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Access policy</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <Badge variant="outline">{route.accessMode}</Badge>
          <span className="ml-2 text-xs text-muted-foreground">
            TLS: {route.tlsEnabled ? 'on' : 'off'}
          </span>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Generated config revision</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {latestRevision ? (
            <div className="space-y-1">
              <div>
                <span className="text-muted-foreground">Version: </span>
                {latestRevision.version}
              </div>
              <div className="font-mono text-xs">
                <span className="text-muted-foreground">Hash: </span>
                {latestRevision.hash}
              </div>
            </div>
          ) : (
            '—'
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Health checks</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <div>
            <span className="text-muted-foreground">DNS: </span>
            <Badge variant="outline">{route.dnsStatus ?? 'unknown'}</Badge>
          </div>
          <div>
            <span className="text-muted-foreground">TLS: </span>
            <Badge variant="outline">{route.tlsStatus ?? 'unknown'}</Badge>
          </div>
          <div>
            <span className="text-muted-foreground">Health: </span>
            <Badge variant="outline">{route.healthStatus ?? 'unknown'}</Badge>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recent changes</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No recent events.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {logs.map((l) => (
                <li key={l._id}>
                  <span className="text-muted-foreground">
                    {l.createdAt ? new Date(l.createdAt).toLocaleString() : ''}{' '}
                  </span>
                  <span className="font-mono">{l.eventType}</span> {l.message}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
