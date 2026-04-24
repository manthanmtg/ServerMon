'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';

interface PreflightResult {
  id: string;
  label: string;
  status: string;
  detail?: string;
  fix?: string;
}

export function DnsVerifier() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PreflightResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/fleet/server/preflight', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResults(
        (data.results ?? []).filter(
          (r: PreflightResult) => r.id.startsWith('dns') || r.id.startsWith('tls')
        )
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="space-y-3">
      <Button onClick={run} disabled={loading} variant="outline">
        {loading ? <Spinner /> : 'Check DNS + TLS'}
      </Button>
      {error && <div className="text-sm text-destructive">{error}</div>}
      {results && (
        <div className="space-y-2">
          {results.length === 0 && (
            <div className="text-sm text-muted-foreground">No DNS/TLS checks configured.</div>
          )}
          {results.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-sm">
              <Badge variant="outline">{r.status}</Badge>
              <span>{r.label}</span>
              {r.detail && <span className="text-muted-foreground">— {r.detail}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
