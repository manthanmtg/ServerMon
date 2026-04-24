'use client';
import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

interface UpdateJob {
  _id: string;
  targets: { mode: string; ids?: string[]; tag?: string };
  versionTarget: string;
  versionSource?: string;
  strategy?: {
    batchSize?: number;
    pauseOnFailure?: boolean;
    autoStopThresholdPct?: number;
  };
  status: string;
  createdAt?: string;
}

interface NodeRow {
  _id: string;
  name: string;
  slug: string;
  agentVersion?: string;
}

function jobStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'completed':
      return 'success';
    case 'failed':
      return 'destructive';
    case 'paused':
      return 'warning';
    case 'running':
      return 'default';
    default:
      return 'outline';
  }
}

interface FormState {
  mode: 'fleet' | 'tag' | 'node' | 'list';
  tag: string;
  ids: string;
  versionTarget: string;
  batchSize: number;
  pauseOnFailure: boolean;
  autoStopThresholdPct: number;
}

const INITIAL_FORM: FormState = {
  mode: 'fleet',
  tag: '',
  ids: '',
  versionTarget: '',
  batchSize: 5,
  pauseOnFailure: true,
  autoStopThresholdPct: 30,
};

export function AgentUpdateCenter() {
  const [jobs, setJobs] = useState<UpdateJob[] | null>(null);
  const [nodes, setNodes] = useState<NodeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [busy, setBusy] = useState(false);

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/fleet/updates');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setJobs(data.jobs ?? []);
      setError(null);
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
    loadJobs();
    loadNodes();
  }, [loadJobs, loadNodes]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const targets: { mode: string; ids?: string[]; tag?: string } = {
        mode: form.mode,
      };
      if (form.mode === 'tag') targets.tag = form.tag;
      if (form.mode === 'list' || form.mode === 'node') {
        targets.ids = form.ids
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);
      }
      const body = {
        targets,
        versionTarget: form.versionTarget,
        strategy: {
          batchSize: Number(form.batchSize),
          pauseOnFailure: form.pauseOnFailure,
          autoStopThresholdPct: Number(form.autoStopThresholdPct),
        },
      };
      const res = await fetch('/api/fleet/updates', {
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
      await loadJobs();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const patchJob = async (id: string, action: 'pause' | 'resume' | 'cancel') => {
    setError(null);
    try {
      const res = await fetch(`/api/fleet/updates/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await loadJobs();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const versionGroups = (nodes ?? []).reduce<Record<string, number>>((acc, n) => {
    const v = n.agentVersion ?? 'unknown';
    acc[v] = (acc[v] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Agent version inventory</CardTitle>
        </CardHeader>
        <CardContent>
          {!nodes && (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          )}
          {nodes && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(versionGroups).map(([v, count]) => (
                <Badge key={v} variant="outline">
                  {v}: {count}
                </Badge>
              ))}
              {Object.keys(versionGroups).length === 0 && (
                <span className="text-muted-foreground text-sm">No nodes yet.</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Update jobs</CardTitle>
          <Button onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Close' : 'New update job'}
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
                  <label htmlFor="upd-mode" className="block text-sm font-medium text-foreground">
                    Scope mode
                  </label>
                  <select
                    id="upd-mode"
                    value={form.mode}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        mode: e.target.value as FormState['mode'],
                      })
                    }
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="fleet">fleet</option>
                    <option value="tag">tag</option>
                    <option value="node">node</option>
                    <option value="list">list</option>
                  </select>
                </div>
                {form.mode === 'tag' && (
                  <Input
                    label="Tag"
                    value={form.tag}
                    onChange={(e) => setForm({ ...form, tag: e.target.value })}
                  />
                )}
                {(form.mode === 'node' || form.mode === 'list') && (
                  <Input
                    label="Node IDs (comma-separated)"
                    value={form.ids}
                    onChange={(e) => setForm({ ...form, ids: e.target.value })}
                  />
                )}
                <Input
                  label="Version target"
                  value={form.versionTarget}
                  onChange={(e) => setForm({ ...form, versionTarget: e.target.value })}
                  placeholder="1.2.3"
                />
                <Input
                  label="Batch size"
                  type="number"
                  value={form.batchSize}
                  onChange={(e) => setForm({ ...form, batchSize: Number(e.target.value) })}
                />
                <Input
                  label="Auto-stop threshold (%)"
                  type="number"
                  value={form.autoStopThresholdPct}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      autoStopThresholdPct: Number(e.target.value),
                    })
                  }
                />
                <label className="flex items-center gap-2 text-sm pt-5">
                  <input
                    type="checkbox"
                    checked={form.pauseOnFailure}
                    onChange={(e) => setForm({ ...form, pauseOnFailure: e.target.checked })}
                  />
                  Pause on failure
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowForm(false)} type="button">
                  Cancel
                </Button>
                <Button
                  onClick={submit}
                  disabled={busy || !form.versionTarget}
                  loading={busy}
                  type="button"
                >
                  Create job
                </Button>
              </div>
            </div>
          )}
          {!jobs && (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          )}
          {jobs && jobs.length === 0 && (
            <p className="text-sm text-muted-foreground">No update jobs.</p>
          )}
          {jobs && jobs.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">Version</th>
                    <th className="py-2 pr-2 font-medium">Scope</th>
                    <th className="py-2 pr-2 font-medium">Status</th>
                    <th className="py-2 pr-2 font-medium">Created</th>
                    <th className="py-2 pr-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j._id} className="border-b border-border/50 last:border-none">
                      <td className="py-2 pr-2 font-mono text-xs">{j.versionTarget}</td>
                      <td className="py-2 pr-2 text-xs">
                        {j.targets?.mode}
                        {j.targets?.tag ? ` · ${j.targets.tag}` : ''}
                      </td>
                      <td className="py-2 pr-2">
                        <Badge variant={jobStatusVariant(j.status)}>{j.status}</Badge>
                      </td>
                      <td className="py-2 pr-2 text-xs text-muted-foreground">
                        {j.createdAt ? new Date(j.createdAt).toLocaleString() : '—'}
                      </td>
                      <td className="py-2 pr-2 text-right space-x-1">
                        {j.status === 'running' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => patchJob(j._id, 'pause')}
                          >
                            Pause
                          </Button>
                        )}
                        {j.status === 'paused' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => patchJob(j._id, 'resume')}
                          >
                            Resume
                          </Button>
                        )}
                        {(j.status === 'running' ||
                          j.status === 'paused' ||
                          j.status === 'pending') && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => patchJob(j._id, 'cancel')}
                          >
                            Cancel
                          </Button>
                        )}
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
