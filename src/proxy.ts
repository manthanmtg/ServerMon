import { NextRequest, NextResponse } from 'next/server';
import { decrypt, updateSession } from '@/lib/session';
import { isPublicApiRoute, isPublicRoute } from '@/lib/auth-routes';

export default async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  const routeIsPublic = isPublicRoute(path);
  const apiRouteIsPublic = isPublicApiRoute(path);

  const cookie = req.cookies.get('session')?.value;
  const session = cookie ? await decrypt(cookie).catch(() => null) : null;

  if (!routeIsPublic && !apiRouteIsPublic && !session) {
    if (path.startsWith('/api')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', req.nextUrl));
  }

  if (routeIsPublic && session) {
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl));
  }

  if (session && !routeIsPublic && !apiRouteIsPublic) {
    return (await updateSession(req)) ?? NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
