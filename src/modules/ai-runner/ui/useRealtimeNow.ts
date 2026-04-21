'use client';

import { useEffect, useState } from 'react';

export function useRealtimeNow(enabled: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;

    let interval: number | null = null;

    const start = () => {
      if (interval !== null) return;
      setNow(Date.now());
      interval = window.setInterval(() => setNow(Date.now()), intervalMs);
    };

    const stop = () => {
      if (interval !== null) {
        window.clearInterval(interval);
        interval = null;
      }
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
  }, [enabled, intervalMs]);

  return now;
}
