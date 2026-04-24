'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

export interface RotateTokenNode {
  _id: string;
  name: string;
  slug: string;
}

export interface RotateTokenResult {
  nodeId: string;
  slug: string;
  name: string;
  newToken: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onResult: (result: RotateTokenResult) => void;
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

export function RotateTokenFlow({ open, onClose, onResult }: Props) {
  const [nodes, setNodes] = useState<RotateTokenNode[] | null>(null);
  const [nodesError, setNodesError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadNodes = useCallback(async () => {
    setNodesError(null);
    setNodes(null);
    try {
      const res = await fetch('/api/fleet/nodes?limit=200');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { nodes?: RotateTokenNode[] };
      setNodes(data.nodes ?? []);
    } catch (e) {
      setNodesError((e as Error).message);
      setNodes([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedId('');
    setReason('');
    setSubmitError(null);
    setBusy(false);
    loadNodes();
  }, [open, loadNodes]);

  const filtered = useMemo(() => {
    if (!nodes) return [];
    const q = query.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter(
      (n) => n.name.toLowerCase().includes(q) || n.slug.toLowerCase().includes(q)
    );
  }, [nodes, query]);

  const selected = useMemo(
    () => nodes?.find((n) => n._id === selectedId) ?? null,
    [nodes, selectedId]
  );

  const canSubmit = !!selected && reason.trim().length >= 10 && !busy;

  const submit = async () => {
    if (!selected) {
      setSubmitError('Select a node.');
      return;
    }
    if (reason.trim().length < 10) {
      setSubmitError('Reason must be at least 10 characters.');
      return;
    }
    setBusy(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/fleet/emergency', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'rotate_token',
          targetId: selected._id,
          reason: reason.trim(),
          confirm: true,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { pairingToken?: string };
      if (!data.pairingToken) {
        throw new Error('Response missing pairingToken');
      }
      onResult({
        nodeId: selected._id,
        slug: selected.slug,
        name: selected.name,
        newToken: data.pairingToken,
      });
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
      aria-labelledby="rotate-token-title"
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
            <h3 id="rotate-token-title" className="text-base font-bold">
              Rotate agent token
            </h3>
            <p className="text-sm text-muted-foreground">
              Issue a new pairing token for a single node. The existing token stops working
              immediately.
            </p>
          </div>

          {nodesError && (
            <div
              role="alert"
              className="rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"
            >
              Failed to load nodes: {nodesError}
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground" htmlFor="rotate-search">
              Node
            </label>
            <Input
              id="rotate-search"
              placeholder="Search by name or slug…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search nodes"
            />
            <div className="max-h-48 overflow-auto rounded-md border border-border">
              {!nodes && (
                <div className="flex justify-center py-4">
                  <Spinner />
                </div>
              )}
              {nodes && filtered.length === 0 && (
                <p className="p-3 text-xs text-muted-foreground">No nodes match.</p>
              )}
              {nodes &&
                filtered.length > 0 &&
                filtered.map((n) => {
                  const isSelected = n._id === selectedId;
                  return (
                    <button
                      key={n._id}
                      type="button"
                      onClick={() => setSelectedId(n._id)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                        isSelected ? 'bg-accent/70' : ''
                      }`}
                      aria-pressed={isSelected}
                    >
                      <span className="truncate font-medium">{n.name}</span>
                      <Badge variant={isSelected ? 'default' : 'outline'}>{n.slug}</Badge>
                    </button>
                  );
                })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground" htmlFor="rotate-reason">
              Reason
            </label>
            <textarea
              id="rotate-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-md border border-input bg-background p-2 text-sm"
              rows={3}
              placeholder="Why rotate this token? (min 10 chars)"
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
            disabled={!canSubmit}
            loading={busy}
            aria-label="Rotate token"
          >
            Rotate token
          </Button>
        </div>
      </div>
    </div>
  );
}

interface PanelProps {
  result: RotateTokenResult;
  onDismiss: () => void;
}

export function RotateTokenResultPanel({ result, onDismiss }: PanelProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const ok = await copyToClipboard(result.newToken);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>New token for {result.slug}</CardTitle>
        <Button variant="ghost" size="sm" onClick={onDismiss} aria-label="Dismiss token">
          Dismiss
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          role="alert"
          className="rounded border border-warning/40 bg-warning/10 p-3 text-sm text-warning"
        >
          <strong>This token will only be shown once.</strong> Copy it now and store it securely.
          Closing this panel discards the plaintext.
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-muted-foreground">
            Pairing token for <span className="font-mono text-foreground">{result.name}</span>
          </label>
          <div className="flex items-center gap-2">
            <code
              data-testid="rotate-token-value"
              className="flex-1 break-all rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs"
            >
              {result.newToken}
            </code>
            <Button variant="outline" size="sm" onClick={copy} aria-label="Copy token">
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
