const PUBLIC_ROUTES = ['/', '/login', '/setup'] as const;

const PUBLIC_API_ROUTES = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/verify',
  '/api/auth/passkey/login/options',
  '/api/auth/passkey/login/verify',
  '/api/setup/init',
  '/api/setup/complete',
  '/api/settings/branding',
  '/api/settings/branding/icon',
  '/api/health',
  '/api/health/ping',
  '/api/fleet/install',
  '/api/fleet/install/script',
] as const;

const PUBLIC_API_PREFIXES = ['/api/fleet/public'] as const;

export function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some((route) => pathname === route);
}

export function isPublicApiRoute(pathname: string) {
  if (PUBLIC_API_ROUTES.some((route) => pathname === route)) return true;
  if (PUBLIC_API_PREFIXES.some((route) => pathname.startsWith(`${route}/`))) return true;

  return (
    /^\/api\/endpoints\/[^/]+$/.test(pathname) ||
    /^\/api\/fleet\/nodes\/[^/]+(?:\/(?:pair|heartbeat))?$/.test(pathname)
  );
}
