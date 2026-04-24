'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import ConfirmationModal from '@/components/ui/ConfirmationModal';

interface Revision {
  _id: string;
  kind: 'frps' | 'frpc' | 'nginx';
  targetId?: string;
  version: number;
  hash: string;
  rendered?: string;
  diffFromPrevious?: string;
  createdBy?: string;
  createdAt?: string;
  appliedAt?: string;
  rolledBackAt?: string;
}

interface Props {
  defaultKind?: 'frps' | 'frpc' | 'nginx';
  defaultTargetId?: string;
  lockFilters?: boolean;
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function diffLineClass(line: string): string {
  if (line.startsWith('+')) return 'text-success';
  if (line.startsWith('-')) return 'text-destructive';
  return 'text-foreground';
}

function DiffView({ diff }: { diff?: string }) {
  if (!diff) {
    return (
      <pre className="rounded border border-border bg-muted/30 p-2 text-xs overflow-auto max-h-60 whitespace-pre-wrap font-mono text-muted-foreground">
        (no diff available)
      </pre>
    );
  }
  const lines = diff.split('\n');
  return (
    <pre
      data-testid="revision-diff"
      className="rounded border border-border bg-muted/30 p-2 text-xs overflow-auto max-h-60 font-mono"
    >
      {lines.map((line, idx) => (
        <span key={idx} className={`block whitespace-pre-wrap ${diffLineClass(line)}`}>
          {line.length === 0 ? '\u00A0' : line}
        </span>
      ))}
    </pre>
  );
}

export function ConfigRevisionHistory({ defaultKind, defaultTargetId, lockFilters }: Props = {}) {
  const [kind, setKind] = useState<string>(defaultKind ?? '');
  const [targetId, setTargetId] = useState<string>(defaultTargetId ?? '');
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [selected, setSelected] = useState<Revision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRollback, setConfirmRollback] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set('limit', '100');
    if (kind) params.set('kind', kind);
    if (targetId) params.set('targetId', targetId);
    return params.toString();
  }, [kind, targetId]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/fleet/revisions?${query}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRevisions(data.revisions ?? []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const latestKey = useCallback((r: Revision) => `${r.kind}::${r.targetId ?? ''}`, []);

  // For each (kind, targetId) group, the highest version is the latest.
  const latestIdsByGroup = useMemo(() => {
    const map = new Map<string, string>();
    if (!revisions) return map;
    for (const r of revisions) {
      const key = latestKey(r);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, r._id);
        continue;
      }
      const existingRev = revisions.find((x) => x._id === existing);
      if (existingRev && r.version > existingRev.version) {
        map.set(key, r._id);
      }
    }
    return map;
  }, [revisions, latestKey]);

  const isLatest = useCallback(
    (r: Revision) => latestIdsByGroup.get(latestKey(r)) === r._id,
    [latestIdsByGroup, latestKey]
  );

  const pick = async (r: Revision) => {
    setSelected(null);
    setConfirmation(null);
    setError(null);
    try {
      const res = await fetch(`/api/fleet/revisions/${r._id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSelected(data.revision ?? r);
    } catch {
      setSelected(r);
    }
  };

  const doApply = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setConfirmation(null);
    try {
      const res = await fetch(`/api/fleet/revisions/${selected._id}/apply`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setConfirmation(`Applied revision v${selected.version}.`);
      await load();
      // Refresh detail so appliedAt updates the button state.
      try {
        const refreshed = await fetch(`/api/fleet/revisions/${selected._id}`);
        if (refreshed.ok) {
          const data = await refreshed.json();
          setSelected(data.revision ?? selected);
        }
      } catch {
        // best-effort refresh only
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doRollback = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setConfirmation(null);
    try {
      const res = await fetch(`/api/fleet/revisions/${selected._id}/rollback`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setConfirmRollback(false);
      setConfirmation(`Rolled back revision v${selected.version}.`);
      setSelected(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const applyDisabled = !!selected?.appliedAt || busy;
  const rollbackDisabled = !selected || isLatest(selected) || busy;

  return (
    <div className="space-y-4">
      {confirmation && (
        <div
          role="status"
          className="rounded border border-success/30 bg-success/10 p-2 text-sm text-success"
        >
          {confirmation}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Config revisions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!lockFilters && (
              <div className="flex flex-wrap gap-2 items-end">
                <div className="space-y-1.5 w-40">
                  <label htmlFor="rev-kind" className="block text-sm font-medium text-foreground">
                    Kind
                  </label>
                  <select
                    id="rev-kind"
                    value={kind}
                    onChange={(e) => setKind(e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">All kinds</option>
                    <option value="frps">frps</option>
                    <option value="frpc">frpc</option>
                    <option value="nginx">nginx</option>
                  </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <Input
                    label="Target ID"
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    placeholder="Optional node / route id"
                  />
                </div>
              </div>
            )}
            {!revisions && (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            )}
            {revisions && revisions.length === 0 && (
              <p className="text-sm text-muted-foreground">No revisions.</p>
            )}
            {revisions && revisions.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-2 font-medium">Version</th>
                      <th className="py-2 pr-2 font-medium">Kind</th>
                      <th className="py-2 pr-2 font-medium">Target</th>
                      <th className="py-2 pr-2 font-medium">Hash</th>
                      <th className="py-2 pr-2 font-medium">Created</th>
                      <th className="py-2 pr-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {revisions.map((r) => {
                      const isSelected = selected?._id === r._id;
                      return (
                        <tr
                          key={r._id}
                          className={`border-b border-border/50 last:border-none ${
                            isSelected ? 'bg-accent/40' : ''
                          }`}
                        >
                          <td className="py-2 pr-2">v{r.version}</td>
                          <td className="py-2 pr-2">
                            <Badge variant="outline">{r.kind}</Badge>
                          </td>
                          <td className="py-2 pr-2 font-mono text-xs">{r.targetId ?? '—'}</td>
                          <td className="py-2 pr-2 font-mono text-xs">{r.hash.slice(0, 12)}</td>
                          <td className="py-2 pr-2 text-xs text-muted-foreground">
                            {formatDate(r.createdAt)}
                          </td>
                          <td className="py-2 pr-2 text-right">
                            <Button variant="outline" size="sm" onClick={() => pick(r)}>
                              View
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card aria-label="Revision detail">
          {!selected && (
            <>
              <CardHeader>
                <CardTitle>Revision detail</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Select a revision to view details.</p>
              </CardContent>
            </>
          )}
          {selected && (
            <>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle>
                  v{selected.version} · {selected.kind}
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelected(null);
                      setConfirmation(null);
                    }}
                  >
                    Close
                  </Button>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={doApply}
                    disabled={applyDisabled}
                    loading={busy}
                  >
                    Apply
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmRollback(true)}
                    disabled={rollbackDisabled}
                  >
                    Rollback
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <dl
                  className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs"
                  data-testid="revision-metadata"
                >
                  <dt className="text-muted-foreground">Kind</dt>
                  <dd>{selected.kind}</dd>
                  <dt className="text-muted-foreground">Target ID</dt>
                  <dd className="font-mono break-all">{selected.targetId ?? '—'}</dd>
                  <dt className="text-muted-foreground">Version</dt>
                  <dd>v{selected.version}</dd>
                  <dt className="text-muted-foreground">Hash</dt>
                  <dd className="font-mono">{selected.hash.slice(0, 12)}</dd>
                  <dt className="text-muted-foreground">Created by</dt>
                  <dd>{selected.createdBy ?? '—'}</dd>
                  <dt className="text-muted-foreground">Created at</dt>
                  <dd>{formatDate(selected.createdAt)}</dd>
                  <dt className="text-muted-foreground">Applied at</dt>
                  <dd>{formatDate(selected.appliedAt)}</dd>
                  <dt className="text-muted-foreground">Rolled back at</dt>
                  <dd>{formatDate(selected.rolledBackAt)}</dd>
                </dl>

                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Rendered</div>
                  <pre className="rounded border border-border bg-muted/30 p-2 text-xs overflow-auto max-h-60 whitespace-pre-wrap font-mono">
                    {selected.rendered ?? '(empty)'}
                  </pre>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">
                    Diff from previous
                  </div>
                  <DiffView diff={selected.diffFromPrevious} />
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>

      <ConfirmationModal
        isOpen={confirmRollback}
        onCancel={() => setConfirmRollback(false)}
        onConfirm={doRollback}
        title="Rollback to this revision?"
        message="Rolling back creates a new revision that re-applies this config."
        confirmLabel="Rollback"
        variant="warning"
        isLoading={busy}
      />
    </div>
  );
}
