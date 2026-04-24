export const PUBLIC_ROUTES = ['/login', '/setup'] as const;

export const PUBLIC_API_ROUTE_PREFIXES = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/passkey',
  '/api/auth/verify',
  '/api/setup',
  '/api/settings/branding',
  '/api/endpoints',
  '/api/fleet/public',
] as const;

export function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some((route) => pathname === route);
}

export function isPublicApiRoute(pathname: string) {
  return PUBLIC_API_ROUTE_PREFIXES.some((route) => pathname.startsWith(route));
}
