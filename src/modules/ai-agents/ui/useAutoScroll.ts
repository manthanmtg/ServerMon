'use client';

import { useEffect, useRef } from 'react';

/**
 * Reusable hook for managing scroll-to-bottom behavior in scrollable containers.
 * 
 * @param dependencies - Array of values that trigger a scroll when changed (e.g. message list)
 * @param enabled - Whether autoscroll is currently active
 * @returns A ref to be attached to the scrollable container
 */
export function useAutoScroll(dependencies: any[], enabled: boolean = true) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (enabled && scrollRef.current) {
      const el = scrollRef.current;
      // Scroll to bottom
      el.scrollTop = el.scrollHeight;
    }
  }, [dependencies, enabled]);

  return scrollRef;
}
