'use client';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';

export interface RotateAllTokenRow {
  nodeId: string;
  slug: string;
  newToken: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onResult: (rows: RotateAllTokenRow[]) => void;
}

async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fall through
  }
  return false;
}

interface NodeSummary {
  _id: string;
  slug: string;
}

export function RotateAllTokensFlow({ open, onClose, onResult }: Props) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [nodeCount, setNodeCount] = useState<number | null>(null);

  const loadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/fleet/nodes?limit=200');
      if (!res.ok) return;
      const data = (await res.json()) as { total?: number; nodes?: unknown[] };
      setNodeCount(
        typeof data.total === 'number'
          ? data.total
          : Array.isArray(data.nodes)
            ? data.nodes.length
            : 0
      );
    } catch {
      setNodeCount(null);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setReason('');
    setSubmitError(null);
    setBusy(false);
    setNodeCount(null);
    loadCount();
  }, [open, loadCount]);

  const submit = async () => {
    if (reason.trim().length < 10) {
      setSubmitError('Reason must be at least 10 characters.');
      return;
    }
    setBusy(true);
    setSubmitError(null);
    try {
      // Fetch the latest node list so we can map nodeId → slug for the results table.
      const nodesRes = await fetch('/api/fleet/nodes?limit=200');
      const nodesData = nodesRes.ok
        ? ((await nodesRes.json()) as { nodes?: NodeSummary[] })
        : { nodes: [] };
      const nodesById = new Map<string, NodeSummary>(
        (nodesData.nodes ?? []).map((n) => [n._id, n])
      );

      const res = await fetch('/api/fleet/emergency', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'rotate_all_tokens',
          reason: reason.trim(),
          confirm: true,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        tokens?: Array<{ nodeId: string; pairingToken: string }>;
      };
      const rows: RotateAllTokenRow[] = (data.tokens ?? []).map((t) => ({
        nodeId: t.nodeId,
        slug: nodesById.get(t.nodeId)?.slug ?? t.nodeId,
        newToken: t.pairingToken,
      }));
      onResult(rows);
      onClose();
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rotate-all-tokens-title"
    >
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="p-5 space-y-4">
          <div className="space-y-1">
            <h3 id="rotate-all-tokens-title" className="text-base font-bold text-destructive">
              Rotate ALL agent tokens
            </h3>
            <p className="text-sm text-muted-foreground">
              Every node in the fleet will receive a fresh pairing token. Existing agents will stop
              working until they are re-paired.
            </p>
          </div>

          <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <div className="font-medium text-destructive">Blast radius</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {nodeCount === null ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner /> Measuring affected nodes…
                </span>
              ) : (
                <>
                  <span className="font-mono text-foreground">{nodeCount}</span> node
                  {nodeCount === 1 ? '' : 's'} will be re-tokenised.
                </>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor="rotate-all-reason"
            >
              Reason
            </label>
            <textarea
              id="rotate-all-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-md border border-input bg-background p-2 text-sm"
              rows={3}
              placeholder="Why rotate every token? (min 10 chars)"
            />
          </div>

          {submitError && (
            <div
              role="alert"
              className="rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"
            >
              {submitError}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border bg-muted/30 p-4 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={busy || reason.trim().length < 10}
            loading={busy}
            aria-label="Rotate all tokens"
          >
            Rotate all tokens
          </Button>
        </div>
      </div>
    </div>
  );
}

interface PanelProps {
  rows: RotateAllTokenRow[];
  onDismiss: () => void;
}

export function RotateAllTokensResultPanel({ rows, onDismiss }: PanelProps) {
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const copyRow = async (row: RotateAllTokenRow) => {
    const ok = await copyToClipboard(row.newToken);
    if (ok) {
      setCopiedRowId(row.nodeId);
      window.setTimeout(
        () => setCopiedRowId((current) => (current === row.nodeId ? null : current)),
        2000
      );
    }
  };

  const copyAll = async () => {
    const payload = JSON.stringify(
      rows.map((r) => ({ nodeId: r.nodeId, slug: r.slug, newToken: r.newToken })),
      null,
      2
    );
    const ok = await copyToClipboard(payload);
    if (ok) {
      setCopiedAll(true);
      window.setTimeout(() => setCopiedAll(false), 2000);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>New tokens for {rows.length} nodes</CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={copyAll}
            aria-label="Copy all tokens as JSON"
          >
            {copiedAll ? 'Copied JSON' : 'Copy all as JSON'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDismiss} aria-label="Dismiss tokens">
            Dismiss
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          role="alert"
          className="rounded border border-warning/40 bg-warning/10 p-3 text-sm text-warning"
        >
          <strong>These tokens will only be shown once.</strong> Copy them now and distribute them
          to each agent. Dismissing this panel discards the plaintext.
        </div>
        <div className="overflow-auto rounded-md border border-border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Slug</th>
                <th className="px-3 py-2 text-left font-medium">New token</th>
                <th className="px-3 py-2 text-right font-medium">Copy</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.nodeId}
                  className="border-t border-border"
                  data-testid={`rotate-all-row-${row.slug}`}
                >
                  <td className="px-3 py-2 font-mono text-xs">{row.slug}</td>
                  <td className="px-3 py-2">
                    <code className="break-all font-mono text-xs">{row.newToken}</code>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyRow(row)}
                      aria-label={`Copy token for ${row.slug}`}
                    >
                      {copiedRowId === row.nodeId ? 'Copied' : 'Copy'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
