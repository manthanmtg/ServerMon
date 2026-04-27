'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';

interface ProxyRule {
  name: string;
  type: 'tcp' | 'http' | 'https' | 'udp' | 'stcp' | 'xtcp';
  subdomain?: string;
  localIp: string;
  localPort: number;
  remotePort?: number;
  customDomains?: string[];
  enabled: boolean;
  status?: string;
}

export function ProxyRuleTable({ nodeId }: { nodeId: string }) {
  const [rules, setRules] = useState<ProxyRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/fleet/nodes/${nodeId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const node = data.node ?? data;
        setRules(node.proxyRules ?? []);
        setError(null);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [nodeId]);

  const persist = async (next: ProxyRule[]) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/fleet/nodes/${nodeId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proxyRules: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setRules(data.node?.proxyRules ?? next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const add = () => {
    const list = rules ?? [];
    const next: ProxyRule[] = [
      ...list,
      {
        name: `rule-${list.length + 1}`,
        type: 'tcp',
        localIp: '127.0.0.1',
        localPort: 8001,
        customDomains: [],
        enabled: true,
      },
    ];
    setRules(next);
  };

  const update = (i: number, patch: Partial<ProxyRule>) => {
    if (!rules) return;
    const next = rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    setRules(next);
  };

  const remove = async (i: number) => {
    if (!rules) return;
    const next = rules.filter((_, idx) => idx !== i);
    setRules(next);
    await persist(next);
  };

  if (!rules)
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Proxy Rules</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" type="button" onClick={add}>
            Add rule
          </Button>
          <Button type="button" onClick={() => persist(rules)} disabled={saving} loading={saving}>
            Save changes
          </Button>
        </div>
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
        {rules.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No proxy rules yet. Add one to expose a local service.
          </p>
        )}
        {rules.map((r, i) => (
          <div
            key={i}
            className="rounded border border-border p-2 space-y-2"
            data-testid={`proxy-rule-${i}`}
          >
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
              <Input
                value={r.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="name"
                aria-label={`Rule ${i + 1} name`}
              />
              <select
                value={r.type}
                onChange={(e) => update(i, { type: e.target.value as ProxyRule['type'] })}
                aria-label={`Rule ${i + 1} type`}
                className="h-10 rounded-md border border-input bg-background px-2 text-sm"
              >
                {(['tcp', 'http', 'https', 'udp', 'stcp', 'xtcp'] as const).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <Input
                value={r.localIp}
                onChange={(e) => update(i, { localIp: e.target.value })}
                placeholder="127.0.0.1"
                aria-label={`Rule ${i + 1} local IP`}
              />
              <Input
                type="number"
                value={r.localPort}
                onChange={(e) => update(i, { localPort: Number(e.target.value) })}
                placeholder="local port"
                aria-label={`Rule ${i + 1} local port`}
              />
              <Input
                type="number"
                value={r.remotePort ?? ''}
                onChange={(e) =>
                  update(i, {
                    remotePort: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="remote port"
                aria-label={`Rule ${i + 1} remote port`}
              />
              <div className="flex gap-2 items-center">
                <Input
                  value={r.subdomain ?? ''}
                  onChange={(e) => update(i, { subdomain: e.target.value })}
                  placeholder="subdomain"
                  aria-label={`Rule ${i + 1} subdomain`}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    onChange={(e) => update(i, { enabled: e.target.checked })}
                    aria-label={`Rule ${i + 1} enabled`}
                  />
                  Enabled
                </label>
                {r.status && <Badge variant="outline">{r.status}</Badge>}
              </div>
              <Button
                variant="outline"
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove rule ${i + 1}`}
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
