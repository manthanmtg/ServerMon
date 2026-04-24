'use client';
import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

type LimitKey =
  | 'maxAgents'
  | 'maxPublicRoutes'
  | 'maxProxiesPerNode'
  | 'maxActiveTerminals'
  | 'maxEndpointRuns'
  | 'logRetentionDays'
  | 'logStorageMb'
  | 'bandwidthWarnMbps'
  | 'uploadBodyMb'
  | 'requestTimeoutSec'
  | 'updateBatchSize';

interface Limits {
  maxAgents?: number;
  maxPublicRoutes?: number;
  maxProxiesPerNode?: number;
  maxActiveTerminals?: number;
  maxEndpointRuns?: number;
  logRetentionDays?: number;
  logStorageMb?: number;
  bandwidthWarnMbps?: number;
  uploadBodyMb?: number;
  requestTimeoutSec?: number;
  updateBatchSize?: number;
}

type Enforcement = Partial<Record<LimitKey, 'soft' | 'hard'>>;

interface ResourcePolicy {
  _id: string;
  scope: 'global' | 'node' | 'tag' | 'role';
  scopeId?: string;
  limits: Limits;
  enforcement: Enforcement;
  description?: string;
}

const LIMIT_KEYS: LimitKey[] = [
  'maxAgents',
  'maxPublicRoutes',
  'maxProxiesPerNode',
  'maxActiveTerminals',
  'maxEndpointRuns',
  'logRetentionDays',
  'logStorageMb',
  'bandwidthWarnMbps',
  'uploadBodyMb',
  'requestTimeoutSec',
  'updateBatchSize',
];

function renderUsage(key: LimitKey, nodeCount: number | null, routeCount: number | null): string {
  if (key === 'maxAgents') return nodeCount == null ? '…' : String(nodeCount);
  if (key === 'maxPublicRoutes') return routeCount == null ? '…' : String(routeCount);
  if (key === 'maxActiveTerminals') return '—';
  return '';
}

interface FormState {
  scope: ResourcePolicy['scope'];
  scopeId: string;
  description: string;
  limits: Partial<Record<LimitKey, string>>;
  enforcement: Enforcement;
}

const INITIAL_FORM: FormState = {
  scope: 'global',
  scopeId: '',
  description: '',
  limits: {},
  enforcement: {},
};

export function ResourceGuardSettings() {
  const [policies, setPolicies] = useState<ResourcePolicy[] | null>(null);
  const [nodeCount, setNodeCount] = useState<number | null>(null);
  const [routeCount, setRouteCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [pRes, nRes, rRes] = await Promise.all([
        fetch('/api/fleet/resource-policies'),
        fetch('/api/fleet/nodes?limit=0'),
        fetch('/api/fleet/routes?limit=0'),
      ]);
      if (!pRes.ok) throw new Error(`HTTP ${pRes.status}`);
      const pData = await pRes.json();
      setPolicies(pData.policies ?? []);
      if (nRes.ok) {
        const nData = await nRes.json();
        setNodeCount(nData.total ?? (nData.nodes ?? []).length);
      }
      if (rRes.ok) {
        const rData = await rRes.json();
        setRouteCount(rData.total ?? (rData.routes ?? []).length);
      }
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const limits: Partial<Record<LimitKey, number>> = {};
      for (const k of LIMIT_KEYS) {
        const v = form.limits[k];
        if (v !== undefined && v !== '') {
          const parsed = Number(v);
          if (!Number.isNaN(parsed)) limits[k] = parsed;
        }
      }
      const body = {
        scope: form.scope,
        scopeId: form.scopeId || undefined,
        limits,
        enforcement: form.enforcement,
        description: form.description || undefined,
      };
      const res = await fetch('/api/fleet/resource-policies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const respBody = await res.json().catch(() => ({}));
        throw new Error(respBody.error ?? `HTTP ${res.status}`);
      }
      setShowForm(false);
      setForm(INITIAL_FORM);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/fleet/resource-policies/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Current usage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline">Nodes: {nodeCount ?? '—'}</Badge>
            <Badge variant="outline">Public routes: {routeCount ?? '—'}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Resource policies</CardTitle>
          <Button
            onClick={() => {
              setForm(INITIAL_FORM);
              setShowForm((v) => !v);
            }}
          >
            {showForm ? 'Close' : 'New resource policy'}
          </Button>
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
          {showForm && (
            <div className="space-y-3 rounded border border-border p-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="rp-scope" className="block text-sm font-medium text-foreground">
                    Scope
                  </label>
                  <select
                    id="rp-scope"
                    value={form.scope}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        scope: e.target.value as FormState['scope'],
                      })
                    }
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="global">global</option>
                    <option value="node">node</option>
                    <option value="tag">tag</option>
                    <option value="role">role</option>
                  </select>
                </div>
                <Input
                  label="Scope ID"
                  value={form.scopeId}
                  onChange={(e) => setForm({ ...form, scopeId: e.target.value })}
                  disabled={form.scope === 'global'}
                />
                <Input
                  label="Description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Limits</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {LIMIT_KEYS.map((k) => {
                    const usage = renderUsage(k, nodeCount, routeCount);
                    return (
                      <div key={k} className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <Input
                            label={k}
                            type="number"
                            value={form.limits[k] ?? ''}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                limits: {
                                  ...form.limits,
                                  [k]: e.target.value,
                                },
                              })
                            }
                          />
                          {usage && (
                            <div
                              className="mt-1 text-xs text-muted-foreground"
                              data-testid={`usage-${k}`}
                            >
                              Live: {usage}
                            </div>
                          )}
                        </div>
                        <select
                          aria-label={`Enforcement for ${k}`}
                          value={form.enforcement[k] ?? ''}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              enforcement: {
                                ...form.enforcement,
                                [k]:
                                  e.target.value === ''
                                    ? undefined
                                    : (e.target.value as 'soft' | 'hard'),
                              },
                            })
                          }
                          className="h-10 mt-5 rounded-md border border-input bg-background px-2 text-xs"
                        >
                          <option value="">—</option>
                          <option value="soft">soft</option>
                          <option value="hard">hard</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowForm(false)} type="button">
                  Cancel
                </Button>
                <Button onClick={save} disabled={busy} loading={busy} type="button">
                  Save policy
                </Button>
              </div>
            </div>
          )}
          {!policies && (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          )}
          {policies && policies.length === 0 && (
            <p className="text-sm text-muted-foreground">No resource policies yet.</p>
          )}
          {policies && policies.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">Scope</th>
                    <th className="py-2 pr-2 font-medium">Scope ID</th>
                    <th className="py-2 pr-2 font-medium">Limits</th>
                    <th className="py-2 pr-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {policies.map((p) => (
                    <tr key={p._id} className="border-b border-border/50 last:border-none">
                      <td className="py-2 pr-2">
                        <Badge variant="outline">{p.scope}</Badge>
                      </td>
                      <td className="py-2 pr-2 text-xs font-mono">{p.scopeId ?? '—'}</td>
                      <td className="py-2 pr-2 text-xs">
                        {Object.entries(p.limits ?? {})
                          .filter(([, v]) => v !== undefined)
                          .map(([k, v]) => `${k}=${v}`)
                          .join(', ') || '—'}
                      </td>
                      <td className="py-2 pr-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(p._id)}
                          aria-label={`Delete resource policy ${p._id}`}
                        >
                          Delete
                        </Button>
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
