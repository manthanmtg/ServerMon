'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

interface PreflightResult {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'warn' | 'skip' | 'unknown';
  detail?: string;
  fix?: string;
  evidence?: string;
  durationMs?: number;
}

function statusVariant(s: string): BadgeVariant {
  switch (s) {
    case 'pass':
      return 'success';
    case 'fail':
      return 'destructive';
    case 'warn':
      return 'warning';
    case 'skip':
      return 'outline';
    default:
      return 'secondary';
  }
}

export function PreflightReport() {
  const [results, setResults] = useState<PreflightResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/fleet/server/preflight', {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setResults(data.results ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const grouped = (results ?? []).reduce<Record<string, PreflightResult[]>>((acc, r) => {
    acc[r.status] = acc[r.status] ?? [];
    acc[r.status].push(r);
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Preflight report</CardTitle>
        <Button onClick={run} disabled={busy} loading={busy}>
          Run preflight
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
        {busy && !results && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}
        {!busy && !results && (
          <p className="text-sm text-muted-foreground">
            Click &quot;Run preflight&quot; to check environment readiness.
          </p>
        )}
        {results && results.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              {(['pass', 'fail', 'warn', 'skip', 'unknown'] as const).map(
                (s) =>
                  grouped[s] && (
                    <Badge key={s} variant={statusVariant(s)}>
                      {s}: {grouped[s].length}
                    </Badge>
                  )
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">Check</th>
                    <th className="py-2 pr-2 font-medium">Status</th>
                    <th className="py-2 pr-2 font-medium">Detail</th>
                    <th className="py-2 pr-2 font-medium">Fix</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 last:border-none align-top">
                      <td className="py-2 pr-2">
                        <div className="text-sm">{r.label}</div>
                        <div className="text-xs font-mono text-muted-foreground">{r.id}</div>
                      </td>
                      <td className="py-2 pr-2">
                        <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                      </td>
                      <td className="py-2 pr-2 text-xs max-w-[30ch] break-words">
                        {r.detail ?? '—'}
                      </td>
                      <td className="py-2 pr-2 text-xs max-w-[30ch] break-words">{r.fix ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
