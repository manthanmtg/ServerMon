'use client';

import { useEffect, useRef } from 'react';

/**
 * Reusable hook for managing scroll-to-bottom behavior in scrollable containers.
 *
 * The hook performs its own shallow comparison against the previous dependency
 * values so callers can pass an inline array literal (e.g. `[messages]`)
 * without the effect firing on every render due to a new array identity.
 *
 * @param dependencies - Array of values that trigger a scroll when changed
 * @param enabled - Whether autoscroll is currently active
 * @returns A ref to be attached to the scrollable container
 */
export function useAutoScroll<T extends HTMLElement = HTMLDivElement>(
  dependencies: unknown[],
  enabled: boolean = true
) {
  const scrollRef = useRef<T>(null);
  const prevDepsRef = useRef<unknown[]>([]);
  const prevEnabledRef = useRef<boolean | null>(null);

  useEffect(() => {
    const prev = prevDepsRef.current;
    const depsChanged =
      prev.length !== dependencies.length ||
      dependencies.some((d, i) => !Object.is(d, prev[i]));
    const enabledChanged = prevEnabledRef.current !== enabled;

    prevDepsRef.current = dependencies;
    prevEnabledRef.current = enabled;

    if (!enabled) return;
    if (!depsChanged && !enabledChanged) return;

    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  });

  return scrollRef;
}
