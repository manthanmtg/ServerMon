'use client';

import { useEffect, useEffectEvent, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { isPublicRoute } from '@/lib/auth-routes';
import { SESSION_REFRESH_THROTTLE_MS, SESSION_TIMEOUT_MS } from '@/lib/session-config';

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  'pointerdown',
  'keydown',
  'scroll',
  'touchstart',
];

function isApiRequest(input: RequestInfo | URL) {
  const rawUrl =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input instanceof Request
          ? input.url
          : '';

  if (!rawUrl) return false;

  const resolvedUrl = rawUrl.startsWith('http')
    ? new URL(rawUrl)
    : new URL(rawUrl, window.location.origin);

  return resolvedUrl.origin === window.location.origin && resolvedUrl.pathname.startsWith('/api/');
}

export default function SessionManager() {
  const pathname = usePathname();
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefreshAtRef = useRef(0);
  const redirectingRef = useRef(false);

  const routeIsPublic = isPublicRoute(pathname ?? '/');

  const redirectToLogin = useEffectEvent(() => {
    if (routeIsPublic || redirectingRef.current) return;

    redirectingRef.current = true;
    void fetch('/api/auth/logout', {
      method: 'POST',
      keepalive: true,
    }).catch(() => undefined);

    window.location.replace('/login');
  });

  const resetExpiryTimer = useEffectEvent(() => {
    if (routeIsPublic) return;

    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
    }

    expiryTimerRef.current = setTimeout(() => {
      redirectToLogin();
    }, SESSION_TIMEOUT_MS);
  });

  const refreshSession = useEffectEvent(async () => {
    if (routeIsPublic || redirectingRef.current) return;

    const now = Date.now();
    if (now - lastRefreshAtRef.current < SESSION_REFRESH_THROTTLE_MS) return;

    lastRefreshAtRef.current = now;

    try {
      const response = await fetch('/api/auth/me', { cache: 'no-store' });
      if (response.status === 401) {
        redirectToLogin();
      }
    } catch {
      // Ignore transient network errors and let the next activity retry.
    }
  });

  const recordActivity = useEffectEvent(() => {
    resetExpiryTimer();
    void refreshSession();
  });

  useEffect(() => {
    if (routeIsPublic) {
      if (expiryTimerRef.current) {
        clearTimeout(expiryTimerRef.current);
        expiryTimerRef.current = null;
      }
      return;
    }

    const handleActivity = () => {
      recordActivity();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        recordActivity();
      }
    };

    resetExpiryTimer();

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, handleActivity, { passive: true });
    }
    window.addEventListener('focus', handleActivity);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, handleActivity);
      }
      window.removeEventListener('focus', handleActivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      if (expiryTimerRef.current) {
        clearTimeout(expiryTimerRef.current);
        expiryTimerRef.current = null;
      }
    };
  }, [routeIsPublic]);

  useEffect(() => {
    if (routeIsPublic) return;

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await originalFetch(input, init);

      if (!redirectingRef.current && response.status === 401 && isApiRequest(input)) {
        redirectToLogin();
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [routeIsPublic]);

  return null;
}
