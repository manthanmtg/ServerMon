'use client';
import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import { formatBytes } from '@/lib/utils';

interface BackupJob {
  _id: string;
  type: string;
  scopes: string[];
  destination: { kind: string; path?: string };
  status: string;
  sizeBytes?: number;
  manifestPath?: string;
  retentionDays?: number;
  createdAt?: string;
  finishedAt?: string;
  error?: string;
}

const SCOPES = [
  'nodes',
  'publicRoutes',
  'configs',
  'nginx',
  'certs',
  'policies',
  'audit',
  'retention',
  'templates',
  'imported',
] as const;

function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'completed':
      return 'success';
    case 'failed':
      return 'destructive';
    case 'running':
    case 'queued':
      return 'default';
    default:
      return 'outline';
  }
}

export function BackupRestorePanel() {
  const [jobs, setJobs] = useState<BackupJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedScopes, setSelectedScopes] = useState<Record<string, boolean>>({
    nodes: true,
    publicRoutes: true,
    configs: true,
  });
  const [retentionDays, setRetentionDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [restoreId, setRestoreId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/fleet/backups');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setJobs(data.jobs ?? []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runBackup = async () => {
    setBusy(true);
    setError(null);
    try {
      const scopes = Object.entries(selectedScopes)
        .filter(([, v]) => v)
        .map(([k]) => k);
      if (scopes.length === 0) {
        throw new Error('Pick at least one scope');
      }
      const res = await fetch('/api/fleet/backups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'manual',
          scopes,
          destination: { kind: 'local' },
          retentionDays,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setShowForm(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirmRestore = async () => {
    if (!restoreId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/fleet/backups/${restoreId}/restore`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setRestoreId(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Backups</CardTitle>
          <Button onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Close' : 'Run backup now'}
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
              <div>
                <div className="text-sm font-medium mb-2">Scopes</div>
                <div className="flex flex-wrap gap-3">
                  {SCOPES.map((s) => (
                    <label key={s} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!!selectedScopes[s]}
                        onChange={(e) =>
                          setSelectedScopes((prev) => ({
                            ...prev,
                            [s]: e.target.checked,
                          }))
                        }
                      />
                      {s}
                    </label>
                  ))}
                </div>
              </div>
              <Input
                label="Retention days"
                type="number"
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value))}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowForm(false)} type="button">
                  Cancel
                </Button>
                <Button onClick={runBackup} disabled={busy} loading={busy} type="button">
                  Run backup
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
            <p className="text-sm text-muted-foreground">No backup jobs yet.</p>
          )}
          {jobs && jobs.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">Status</th>
                    <th className="py-2 pr-2 font-medium">Scopes</th>
                    <th className="py-2 pr-2 font-medium">Size</th>
                    <th className="py-2 pr-2 font-medium">Manifest</th>
                    <th className="py-2 pr-2 font-medium">Created</th>
                    <th className="py-2 pr-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j._id} className="border-b border-border/50 last:border-none">
                      <td className="py-2 pr-2">
                        <Badge variant={statusVariant(j.status)}>{j.status}</Badge>
                      </td>
                      <td className="py-2 pr-2 text-xs">{j.scopes.join(', ')}</td>
                      <td className="py-2 pr-2 text-xs font-mono">
                        {j.sizeBytes ? formatBytes(j.sizeBytes) : '—'}
                      </td>
                      <td
                        className="py-2 pr-2 text-xs font-mono truncate max-w-[20ch]"
                        title={j.manifestPath}
                      >
                        {j.manifestPath ?? '—'}
                      </td>
                      <td className="py-2 pr-2 text-xs text-muted-foreground">
                        {j.createdAt ? new Date(j.createdAt).toLocaleString() : '—'}
                      </td>
                      <td className="py-2 pr-2 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={j.status !== 'completed' || !j.manifestPath}
                          onClick={() => setRestoreId(j._id)}
                        >
                          Restore
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

      <ConfirmationModal
        isOpen={restoreId !== null}
        onCancel={() => setRestoreId(null)}
        onConfirm={confirmRestore}
        title="Restore from backup?"
        message="Restoring will re-insert documents from this backup. Existing documents with matching IDs may conflict."
        confirmLabel="Restore"
        variant="warning"
        isLoading={busy}
      />
    </div>
  );
}
