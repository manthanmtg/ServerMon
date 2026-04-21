'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentsSnapshot } from '../types';

export interface UseAgentsSnapshotOptions {
  pollIntervalMs: number;
  /** Called when a fetch fails with a non-abort error. */
  onError?: (err: unknown) => void;
}

export interface UseAgentsSnapshotResult {
  snapshot: AgentsSnapshot | null;
  loading: boolean;
  refreshing: boolean;
  refresh: () => void;
}

/**
 * Poll `/api/modules/ai-agents` for an `AgentsSnapshot`, pausing while the
 * tab is hidden and cancelling in-flight requests on unmount / visibility
 * transitions so the (expensive) snapshot endpoint isn't hammered.
 */
export function useAgentsSnapshot({
  pollIntervalMs,
  onError,
}: UseAgentsSnapshotOptions): UseAgentsSnapshotResult {
  const [snapshot, setSnapshot] = useState<AgentsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Keep the latest error handler without triggering effect re-runs.
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const controllerRef = useRef<AbortController | null>(null);

  const fetchSnapshot = useCallback(async (showRefresh: boolean) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const { signal } = controller;

    if (showRefresh) setRefreshing(true);
    try {
      const res = await fetch('/api/modules/ai-agents', { cache: 'no-store', signal });
      if (!res.ok) return;
      const data = (await res.json()) as AgentsSnapshot;
      if (!signal.aborted) setSnapshot(data);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      onErrorRef.current?.(err);
    } finally {
      if (!signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const refresh = useCallback(() => {
    void fetchSnapshot(true);
  }, [fetchSnapshot]);

  useEffect(() => {
    let interval: number | null = null;

    const tick = () => {
      void fetchSnapshot(false);
    };

    const start = () => {
      if (interval !== null) return;
      tick();
      interval = window.setInterval(tick, pollIntervalMs);
    };

    const stop = () => {
      if (interval !== null) {
        window.clearInterval(interval);
        interval = null;
      }
      controllerRef.current?.abort();
      controllerRef.current = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [fetchSnapshot, pollIntervalMs]);

  return { snapshot, loading, refreshing, refresh };
}
