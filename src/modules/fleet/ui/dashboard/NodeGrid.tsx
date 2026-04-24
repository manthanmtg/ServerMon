'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { NodeCard, type NodeCardData } from './NodeCard';
import { Spinner } from '@/components/ui/spinner';
import { useFleetStream } from '../lib/useFleetStream';

export interface NodeGridProps {
  search?: string;
  tag?: string;
  status?: string;
  pollMs?: number;
}

export function NodeGrid({ search = '', tag = '', status = '', pollMs = 30000 }: NodeGridProps) {
  const [nodes, setNodes] = useState<NodeCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (tag) params.set('tag', tag);
        if (status) params.set('status', status);
        params.set('limit', '200');
        const res = await fetch(`/api/fleet/nodes?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setNodes(data.nodes ?? []);
        setError(null);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    refreshRef.current = () => {
      if (!cancelled) void load();
    };
    load();
    const iv = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [search, tag, status, pollMs]);

  const onStreamEvent = useCallback(
    (ev: { kind: string; at: string; data: Record<string, unknown> }) => {
      if (ev.kind === 'node.heartbeat' || ev.kind === 'node.status_change') {
        refreshRef.current();
      }
    },
    []
  );

  useFleetStream({ onEvent: onStreamEvent });

  if (loading && nodes.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 text-destructive p-4 text-sm">
        Error: {error}
      </div>
    );
  }
  if (nodes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No nodes yet.{' '}
        <Link className="text-primary underline" href="/fleet/onboarding">
          Onboard an agent
        </Link>{' '}
        to get started.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {nodes.map((n) => (
        <NodeCard key={n._id} node={n} onDelete={() => refreshRef.current()} />
      ))}
    </div>
  );
}
