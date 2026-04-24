'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { ExposeForm } from './schema';

interface PreflightResult {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'warn' | 'skip' | 'unknown';
  detail?: string;
  fix?: string;
}

interface Props {
  form: ExposeForm;
  setForm: (f: ExposeForm) => void;
  next: () => void;
  back: () => void;
}

export function StepDns({ next, back }: Props) {
  const [results, setResults] = useState<PreflightResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/fleet/server/preflight', { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { results?: PreflightResult[] };
      const all = data.results ?? [];
      setResults(all.filter((r) => r.id.startsWith('dns.')));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold">DNS check</h4>
        <p className="text-xs text-muted-foreground">
          Verify DNS before creating the route. You can skip this step and re-run checks later from
          the route detail page.
        </p>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button type="button" onClick={run} loading={loading} disabled={loading}>
          Verify DNS
        </Button>
        {loading && <Spinner size="sm" />}
      </div>
      {results && (
        <ul className="space-y-2" aria-label="dns check results">
          {results.length === 0 && (
            <li className="text-xs text-muted-foreground">No DNS checks returned.</li>
          )}
          {results.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-1 rounded-lg border border-border p-3 text-sm"
            >
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    r.status === 'pass'
                      ? 'success'
                      : r.status === 'fail'
                        ? 'destructive'
                        : r.status === 'warn'
                          ? 'warning'
                          : 'outline'
                  }
                >
                  {r.status}
                </Badge>
                <span className="font-medium">{r.label}</span>
              </div>
              {r.detail && <p className="text-xs text-muted-foreground">{r.detail}</p>}
              {r.fix && r.status !== 'pass' && (
                <p className="text-xs text-foreground">
                  <span className="font-medium">Fix: </span>
                  {r.fix}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-between gap-2 pt-2">
        <Button variant="outline" type="button" onClick={back}>
          Back
        </Button>
        <Button variant="outline" type="button" onClick={next}>
          Skip &amp; continue
        </Button>
      </div>
    </div>
  );
}
