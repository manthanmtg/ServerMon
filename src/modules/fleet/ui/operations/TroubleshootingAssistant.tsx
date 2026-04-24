'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

interface DiagnosticStep {
  step: string;
  status: 'pass' | 'fail' | 'unknown';
  evidence?: string;
  likelyCause?: string;
  recommendedFix?: string;
  durationMs?: number;
}

interface DiagnosticRun {
  _id?: string;
  kind: string;
  targetId: string;
  steps: DiagnosticStep[];
  summary?: string;
  startedAt?: string;
  finishedAt?: string;
}

function stepVariant(status: string): BadgeVariant {
  switch (status) {
    case 'pass':
      return 'success';
    case 'fail':
      return 'destructive';
    default:
      return 'outline';
  }
}

export function TroubleshootingAssistant() {
  const [nodeSlug, setNodeSlug] = useState('');
  const [run, setRun] = useState<DiagnosticRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedNodeId, setResolvedNodeId] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const searchRes = await fetch(
        `/api/fleet/nodes?search=${encodeURIComponent(nodeSlug)}&limit=5`
      );
      if (!searchRes.ok) throw new Error(`HTTP ${searchRes.status}`);
      const searchData = await searchRes.json();
      const match = (searchData.nodes ?? []).find((n: { slug: string }) => n.slug === nodeSlug);
      if (!match) {
        throw new Error(`Node "${nodeSlug}" not found`);
      }
      setResolvedNodeId(match._id);

      const res = await fetch(`/api/fleet/nodes/${match._id}/diagnose`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setRun(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rerun = async () => {
    if (!resolvedNodeId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/fleet/nodes/${resolvedNodeId}/diagnose`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setRun(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Troubleshooting assistant</CardTitle>
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
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Input
                label="Node slug"
                value={nodeSlug}
                onChange={(e) => setNodeSlug(e.target.value)}
                placeholder="edge-01"
              />
            </div>
            <Button onClick={go} disabled={busy || !nodeSlug} loading={busy}>
              Diagnose
            </Button>
            {run && (
              <Button variant="outline" onClick={rerun} disabled={busy}>
                Rerun
              </Button>
            )}
          </div>
          {busy && !run && (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          )}
          {run && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <span className="text-muted-foreground">Summary: </span>
                  <Badge variant={stepVariant(run.summary ?? 'unknown')}>
                    {run.summary ?? 'unknown'}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {run.finishedAt ? new Date(run.finishedAt).toLocaleString() : '—'}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-2 font-medium">Step</th>
                      <th className="py-2 pr-2 font-medium">Status</th>
                      <th className="py-2 pr-2 font-medium">Evidence</th>
                      <th className="py-2 pr-2 font-medium">Likely cause</th>
                      <th className="py-2 pr-2 font-medium">Recommended</th>
                    </tr>
                  </thead>
                  <tbody>
                    {run.steps.map((s) => (
                      <tr
                        key={s.step}
                        className="border-b border-border/50 last:border-none align-top"
                      >
                        <td className="py-2 pr-2 text-xs font-mono">{s.step}</td>
                        <td className="py-2 pr-2">
                          <Badge variant={stepVariant(s.status)}>{s.status}</Badge>
                        </td>
                        <td className="py-2 pr-2 text-xs">{s.evidence ?? '—'}</td>
                        <td className="py-2 pr-2 text-xs">{s.likelyCause ?? '—'}</td>
                        <td className="py-2 pr-2 text-xs">{s.recommendedFix ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
