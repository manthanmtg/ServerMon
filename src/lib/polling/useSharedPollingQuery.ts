'use client';

import { useCallback, useSyncExternalStore } from 'react';

export interface SharedPollingOptions<T> {
  key: string;
  fetcher: (signal: AbortSignal) => Promise<T>;
  intervalMs: number;
  enabled?: boolean;
  initialData?: T;
  staleTimeMs?: number;
  maxBackoffMs?: number;
  pauseWhenHidden?: boolean;
  pauseWhenOffline?: boolean;
}

export interface SharedPollingResult<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  refreshing: boolean;
  stale: boolean;
  updatedAt: number | null;
  refresh: () => Promise<void>;
}

interface PollingSnapshot<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  refreshing: boolean;
  stale: boolean;
  updatedAt: number | null;
}

interface PollingConfig<T> {
  fetcher: (signal: AbortSignal) => Promise<T>;
  intervalMs: number;
  staleTimeMs: number;
  maxBackoffMs: number;
  pauseWhenHidden: boolean;
  pauseWhenOffline: boolean;
}

interface PollingEntry<T> {
  key: string;
  config: PollingConfig<T>;
  snapshot: PollingSnapshot<T>;
  listeners: Set<() => void>;
  subscriberCount: number;
  activeCount: number;
  failureCount: number;
  timer: ReturnType<typeof setTimeout> | null;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
  controller: AbortController | null;
  inFlight: Promise<void> | null;
  lifecycleAttached: boolean;
  warnedIncompatible: boolean;
  refresh: () => Promise<void>;
  handleLifecycleChange: () => void;
}

const registry = new Map<string, PollingEntry<unknown>>();
const IDLE_RETENTION_MS = 30_000;

function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function deterministicJitter(key: string): number {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return (hash % 51) / 1000;
}

function isPaused<T>(entry: PollingEntry<T>): boolean {
  if (
    entry.config.pauseWhenHidden &&
    typeof document !== 'undefined' &&
    document.visibilityState === 'hidden'
  ) {
    return true;
  }

  return (
    entry.config.pauseWhenOffline && typeof navigator !== 'undefined' && navigator.onLine === false
  );
}

function emit<T>(entry: PollingEntry<T>, next: Partial<PollingSnapshot<T>>): void {
  entry.snapshot = { ...entry.snapshot, ...next };
  entry.listeners.forEach((listener) => listener());
}

function clearSchedule<T>(entry: PollingEntry<T>): void {
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
}

function nextDelay<T>(entry: PollingEntry<T>): number {
  const base =
    entry.failureCount > 0
      ? Math.min(
          entry.config.intervalMs * 2 ** Math.max(0, entry.failureCount - 1),
          entry.config.maxBackoffMs
        )
      : entry.config.intervalMs;
  return Math.round(base * (1 + deterministicJitter(entry.key)));
}

function schedule<T>(entry: PollingEntry<T>, delayMs = nextDelay(entry)): void {
  clearSchedule(entry);
  if (entry.activeCount === 0 || isPaused(entry)) return;

  entry.timer = setTimeout(
    () => {
      entry.timer = null;
      emit(entry, { stale: true });
      void request(entry);
    },
    Math.max(0, delayMs)
  );
}

function request<T>(entry: PollingEntry<T>, manual = false): Promise<void> {
  if (entry.inFlight) return entry.inFlight;
  if ((!manual && entry.activeCount === 0) || isPaused(entry)) return Promise.resolve();

  clearSchedule(entry);
  const controller = new AbortController();
  entry.controller = controller;
  emit(entry, {
    loading: entry.snapshot.data === undefined,
    refreshing: entry.snapshot.data !== undefined,
  });

  const promise = (async () => {
    try {
      const data = await entry.config.fetcher(controller.signal);
      if (controller.signal.aborted) return;

      entry.failureCount = 0;
      emit(entry, {
        data,
        error: null,
        loading: false,
        refreshing: false,
        stale: false,
        updatedAt: Date.now(),
      });
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) {
        emit(entry, { loading: false, refreshing: false });
        return;
      }

      entry.failureCount += 1;
      emit(entry, {
        error: toError(error),
        loading: false,
        refreshing: false,
        stale: true,
      });
    } finally {
      if (entry.controller === controller) entry.controller = null;
      entry.inFlight = null;
      if (entry.activeCount > 0) schedule(entry);
    }
  })();

  entry.inFlight = promise;
  return promise;
}

function attachLifecycle<T>(entry: PollingEntry<T>): void {
  if (entry.lifecycleAttached || typeof window === 'undefined') return;
  document.addEventListener('visibilitychange', entry.handleLifecycleChange);
  window.addEventListener('online', entry.handleLifecycleChange);
  window.addEventListener('offline', entry.handleLifecycleChange);
  entry.lifecycleAttached = true;
}

function detachLifecycle<T>(entry: PollingEntry<T>): void {
  if (!entry.lifecycleAttached || typeof window === 'undefined') return;
  document.removeEventListener('visibilitychange', entry.handleLifecycleChange);
  window.removeEventListener('online', entry.handleLifecycleChange);
  window.removeEventListener('offline', entry.handleLifecycleChange);
  entry.lifecycleAttached = false;
}

function activate<T>(entry: PollingEntry<T>): void {
  if (entry.cleanupTimer) {
    clearTimeout(entry.cleanupTimer);
    entry.cleanupTimer = null;
  }
  attachLifecycle(entry);

  const updatedAt = entry.snapshot.updatedAt;
  const stale = updatedAt === null || Date.now() - updatedAt >= entry.config.staleTimeMs;
  if (stale) {
    emit(entry, { stale: true });
    void request(entry);
  } else {
    schedule(entry, entry.config.staleTimeMs - (Date.now() - updatedAt));
  }
}

function deactivate<T>(entry: PollingEntry<T>): void {
  clearSchedule(entry);
  entry.controller?.abort();
  detachLifecycle(entry);
}

function scheduleCleanup<T>(entry: PollingEntry<T>): void {
  if (entry.cleanupTimer) clearTimeout(entry.cleanupTimer);
  entry.cleanupTimer = setTimeout(() => {
    if (entry.subscriberCount === 0 && registry.get(entry.key) === entry) {
      registry.delete(entry.key);
    }
  }, IDLE_RETENTION_MS);
}

function createEntry<T>(options: SharedPollingOptions<T>): PollingEntry<T> {
  const entry: PollingEntry<T> = {
    key: options.key,
    config: {
      fetcher: options.fetcher,
      intervalMs: options.intervalMs,
      staleTimeMs: options.staleTimeMs ?? options.intervalMs,
      maxBackoffMs: options.maxBackoffMs ?? options.intervalMs * 16,
      pauseWhenHidden: options.pauseWhenHidden ?? true,
      pauseWhenOffline: options.pauseWhenOffline ?? true,
    },
    snapshot: {
      data: options.initialData,
      error: null,
      loading: options.initialData === undefined,
      refreshing: false,
      stale: true,
      updatedAt: null,
    },
    listeners: new Set<() => void>(),
    subscriberCount: 0,
    activeCount: 0,
    failureCount: 0,
    timer: null,
    cleanupTimer: null,
    controller: null,
    inFlight: null,
    lifecycleAttached: false,
    warnedIncompatible: false,
    refresh: (): Promise<void> => request(entry, true),
    handleLifecycleChange: () => {
      if (isPaused(entry)) {
        clearSchedule(entry);
        return;
      }
      if (entry.activeCount === 0) return;

      const updatedAt = entry.snapshot.updatedAt;
      const stale = updatedAt === null || Date.now() - updatedAt >= entry.config.staleTimeMs;
      if (stale) {
        emit(entry, { stale: true });
        void request(entry);
      } else {
        schedule(entry, entry.config.staleTimeMs - (Date.now() - updatedAt));
      }
    },
  };

  return entry;
}

function getEntry<T>(options: SharedPollingOptions<T>): PollingEntry<T> {
  const existing = registry.get(options.key) as PollingEntry<T> | undefined;
  if (!existing) {
    const entry = createEntry(options);
    registry.set(options.key, entry as PollingEntry<unknown>);
    return entry;
  }

  const incompatible =
    existing.config.fetcher !== options.fetcher ||
    existing.config.intervalMs !== options.intervalMs ||
    existing.config.staleTimeMs !== (options.staleTimeMs ?? options.intervalMs);
  if (
    incompatible &&
    existing.subscriberCount > 0 &&
    !existing.warnedIncompatible &&
    process.env.NODE_ENV !== 'production'
  ) {
    existing.warnedIncompatible = true;
    console.warn(
      `[shared-polling] Consumers for "${options.key}" must use the same fetcher and timing options.`
    );
  }
  return existing;
}

function subscribeEntry<T>(
  entry: PollingEntry<T>,
  enabled: boolean,
  listener: () => void
): () => void {
  entry.listeners.add(listener);
  entry.subscriberCount += 1;
  if (enabled) {
    entry.activeCount += 1;
    if (entry.activeCount === 1) activate(entry);
  }

  return () => {
    entry.listeners.delete(listener);
    entry.subscriberCount = Math.max(0, entry.subscriberCount - 1);
    if (enabled) {
      entry.activeCount = Math.max(0, entry.activeCount - 1);
      if (entry.activeCount === 0) deactivate(entry);
    }
    if (entry.subscriberCount === 0) scheduleCleanup(entry);
  };
}

export function useSharedPollingQuery<T>(options: SharedPollingOptions<T>): SharedPollingResult<T> {
  const entry = getEntry(options);
  const enabled = options.enabled ?? true;

  const subscribe = useCallback(
    (listener: () => void) => subscribeEntry(entry, enabled, listener),
    [enabled, entry]
  );

  const getSnapshot = useCallback(() => entry.snapshot, [entry]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return { ...snapshot, refresh: entry.refresh };
}
