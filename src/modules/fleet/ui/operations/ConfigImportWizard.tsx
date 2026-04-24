'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ImportResult {
  imported?: {
    _id: string;
    kind: string;
    parsed: unknown;
  };
  conflicts?: string[];
}

export function ConfigImportWizard() {
  const [kind, setKind] = useState<'frp' | 'nginx'>('frp');
  const [sourcePath, setSourcePath] = useState('');
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/fleet/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind,
          raw,
          sourcePath: sourcePath || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import configuration</CardTitle>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="imp-kind" className="block text-sm font-medium text-foreground">
              Kind
            </label>
            <select
              id="imp-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as 'frp' | 'nginx')}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="frp">frp</option>
              <option value="nginx">nginx</option>
            </select>
          </div>
          <Input
            label="Source path (optional)"
            value={sourcePath}
            onChange={(e) => setSourcePath(e.target.value)}
            placeholder="/etc/frp/frps.toml"
          />
        </div>
        <label className="block space-y-1.5">
          <span className="block text-sm font-medium text-foreground">Raw config</span>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            className="w-full rounded-md border border-input bg-background p-2 text-xs font-mono"
            rows={12}
            placeholder={
              kind === 'frp'
                ? '[common]\nbind_port = 7000\n'
                : 'server { listen 80; server_name app.example.com; }'
            }
          />
        </label>
        <div className="flex justify-end">
          <Button onClick={submit} disabled={busy || !raw} loading={busy}>
            Import
          </Button>
        </div>
        {result && (
          <div className="space-y-3">
            <div className="rounded border border-border p-3 text-sm space-y-2">
              <div className="font-medium">Parsed result</div>
              <pre className="rounded border border-border bg-muted/30 p-2 text-xs overflow-auto max-h-60 whitespace-pre-wrap font-mono">
                {JSON.stringify(result.imported?.parsed ?? {}, null, 2)}
              </pre>
            </div>
            <div className="rounded border border-border p-3 text-sm space-y-2">
              <div className="font-medium">Conflicts ({result.conflicts?.length ?? 0})</div>
              {result.conflicts && result.conflicts.length > 0 ? (
                <ul className="list-disc pl-5 space-y-1 text-xs">
                  {result.conflicts.map((c, i) => (
                    <li key={i} className="font-mono">
                      {c}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No conflicts detected.</p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
