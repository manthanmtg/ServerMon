'use client';
import { useEffect, useRef, useState } from 'react';

export interface FleetStreamEvent {
  kind: string;
  at: string;
  data: Record<string, unknown>;
  nodeId?: string;
  routeId?: string;
}

export interface UseFleetStreamOpts {
  nodeId?: string;
  routeId?: string;
  kind?: string;
  enabled?: boolean;
  onEvent?: (ev: FleetStreamEvent) => void;
}

export interface UseFleetStreamState {
  connected: boolean;
  error: string | null;
  lastEvent: { kind: string; at: string } | null;
}

function buildUrl(opts: UseFleetStreamOpts): string {
  const params = new URLSearchParams();
  if (opts.nodeId) params.set('nodeId', opts.nodeId);
  if (opts.routeId) params.set('routeId', opts.routeId);
  if (opts.kind) params.set('kind', opts.kind);
  const qs = params.toString();
  return qs ? `/api/fleet/stream?${qs}` : '/api/fleet/stream';
}

const EVENT_KINDS = [
  'node.heartbeat',
  'node.status_change',
  'node.reboot',
  'route.status_change',
  'revision.applied',
  'frp.state_change',
];

function eventSourceSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.EventSource !== 'undefined';
}

export function useFleetStream(opts: UseFleetStreamOpts): UseFleetStreamState {
  const { nodeId, routeId, kind, enabled = true, onEvent } = opts;
  const supported = useState(() => eventSourceSupported())[0];
  const active = enabled && supported;

  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(
    !supported ? 'EventSource is not supported in this environment' : null
  );
  const [lastEvent, setLastEvent] = useState<{ kind: string; at: string } | null>(null);
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!active) return;

    const url = buildUrl({ nodeId, routeId, kind });
    const es = new window.EventSource(url);

    const handleMessage = (ev: MessageEvent) => {
      try {
        const parsed = JSON.parse(ev.data) as FleetStreamEvent;
        setLastEvent({ kind: parsed.kind, at: parsed.at });
        if (onEventRef.current) onEventRef.current(parsed);
      } catch {
        // ignore malformed frames
      }
    };
    const handleOpen = () => {
      setConnected(true);
      setError(null);
    };
    const handleError = () => {
      setConnected(false);
      setError('stream error');
    };

    es.addEventListener('open', handleOpen as EventListener);
    es.addEventListener('error', handleError as EventListener);
    for (const k of EVENT_KINDS) {
      es.addEventListener(k, handleMessage as EventListener);
    }
    es.addEventListener('message', handleMessage as EventListener);

    return () => {
      es.removeEventListener('open', handleOpen as EventListener);
      es.removeEventListener('error', handleError as EventListener);
      for (const k of EVENT_KINDS) {
        es.removeEventListener(k, handleMessage as EventListener);
      }
      es.removeEventListener('message', handleMessage as EventListener);
      es.close();
    };
  }, [nodeId, routeId, kind, active]);

  return { connected, error, lastEvent };
}
