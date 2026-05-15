const PUBLIC_ROUTES = ['/login', '/setup'] as const;

export function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some((route) => pathname === route);
}
