'use client';
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

interface EndpointOption {
  _id: string;
  name: string;
  slug: string;
}

interface NodeOption {
  _id: string;
  name: string;
  slug: string;
}

interface ResultEvent {
  _id: string;
  nodeId?: string;
  eventType?: string;
  message?: string;
  createdAt?: string;
}

type TargetMode = 'fleet' | 'tag' | 'list';

const POLL_MS = 5000;

export function FleetEndpointRunner() {
  const [endpoints, setEndpoints] = useState<EndpointOption[] | null>(null);
  const [nodes, setNodes] = useState<NodeOption[] | null>(null);
  const [selectedEndpoint, setSelectedEndpoint] = useState('');
  const [mode, setMode] = useState<TargetMode>('fleet');
  const [tag, setTag] = useState('');
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [results, setResults] = useState<ResultEvent[]>([]);
  const [dispatching, setDispatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDispatch, setLastDispatch] = useState<{
    endpointId: string;
    dispatched: string[];
  } | null>(null);

  const loadEndpoints = useCallback(async () => {
    try {
      const res = await fetch('/api/modules/endpoints?limit=200');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEndpoints(data.endpoints ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const loadNodes = useCallback(async () => {
    try {
      const res = await fetch('/api/fleet/nodes?limit=200');
      if (!res.ok) return;
      const data = await res.json();
      setNodes(data.nodes ?? []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadEndpoints();
    loadNodes();
  }, [loadEndpoints, loadNodes]);

  const loadResults = useCallback(async () => {
    if (!selectedEndpoint) return;
    try {
      const res = await fetch(
        `/api/fleet/endpoint-exec?endpointId=${encodeURIComponent(selectedEndpoint)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setResults(data.events ?? []);
    } catch {
      // ignore
    }
  }, [selectedEndpoint]);

  useEffect(() => {
    if (!selectedEndpoint) return;
    loadResults();
    const timer = setInterval(loadResults, POLL_MS);
    return () => clearInterval(timer);
  }, [selectedEndpoint, loadResults]);

  const dispatch = async () => {
    if (!selectedEndpoint) {
      setError('Select an endpoint first.');
      return;
    }
    setDispatching(true);
    setError(null);
    try {
      const overrideTarget: {
        mode: TargetMode;
        nodeIds: string[];
        tag?: string;
      } = { mode, nodeIds: [] };
      if (mode === 'tag') overrideTarget.tag = tag;
      if (mode === 'list') overrideTarget.nodeIds = selectedNodeIds;

      const res = await fetch('/api/fleet/endpoint-exec', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          endpointId: selectedEndpoint,
          overrideTarget,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setLastDispatch({ endpointId: data.endpointId, dispatched: data.dispatched ?? [] });
      await loadResults();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDispatching(false);
    }
  };

  const toggleNode = (id: string) => {
    setSelectedNodeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Fleet endpoint runner</CardTitle>
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

          <div className="space-y-1.5">
            <label htmlFor="fep-endpoint" className="block text-sm font-medium text-foreground">
              Endpoint
            </label>
            {!endpoints ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner size="sm" /> Loading endpoints...
              </div>
            ) : (
              <select
                id="fep-endpoint"
                value={selectedEndpoint}
                onChange={(e) => setSelectedEndpoint(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select an endpoint…</option>
                {endpoints.map((ep) => (
                  <option key={ep._id} value={ep._id}>
                    {ep.name} ({ep.slug})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div
            role="tablist"
            aria-label="Target mode"
            className="inline-flex rounded-lg border border-border p-1 gap-1 text-sm"
          >
            {(['fleet', 'tag', 'list'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={
                  mode === m
                    ? 'px-3 py-1 rounded-md bg-primary text-primary-foreground'
                    : 'px-3 py-1 rounded-md text-muted-foreground hover:text-foreground'
                }
              >
                {m === 'fleet' ? 'Fleet' : m === 'tag' ? 'Tag' : 'Node List'}
              </button>
            ))}
          </div>

          {mode === 'tag' && (
            <Input
              label="Tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="prod"
            />
          )}

          {mode === 'list' && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground">Target nodes</label>
              {!nodes ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner size="sm" /> Loading nodes...
                </div>
              ) : nodes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No nodes registered.</p>
              ) : (
                <div
                  role="listbox"
                  aria-multiselectable="true"
                  className="max-h-60 overflow-y-auto rounded border border-border divide-y divide-border"
                >
                  {nodes.map((n) => {
                    const checked = selectedNodeIds.includes(n._id);
                    return (
                      <label
                        key={n._id}
                        className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleNode(n._id)}
                        />
                        <span>
                          {n.name} <span className="text-muted-foreground text-xs">({n.slug})</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              {lastDispatch && (
                <span>Last dispatch: {lastDispatch.dispatched.length} node(s) queued.</span>
              )}
            </div>
            <Button
              onClick={dispatch}
              disabled={dispatching || !selectedEndpoint}
              loading={dispatching}
            >
              Dispatch
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedEndpoint ? (
            <p className="text-sm text-muted-foreground">
              Select an endpoint to see dispatch results.
            </p>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">Node</th>
                    <th className="py-2 pr-2 font-medium">Event</th>
                    <th className="py-2 pr-2 font-medium">Message</th>
                    <th className="py-2 pr-2 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r._id} className="border-b border-border/50 last:border-none">
                      <td className="py-2 pr-2 font-mono text-xs">{r.nodeId ?? '—'}</td>
                      <td className="py-2 pr-2">
                        <Badge
                          variant={
                            r.eventType === 'endpoint.succeeded'
                              ? 'success'
                              : r.eventType === 'endpoint.failed'
                                ? 'destructive'
                                : 'outline'
                          }
                        >
                          {r.eventType ?? 'event'}
                        </Badge>
                      </td>
                      <td className="py-2 pr-2 text-xs">{r.message ?? ''}</td>
                      <td className="py-2 pr-2 text-xs text-muted-foreground">
                        {r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
