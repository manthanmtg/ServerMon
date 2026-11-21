import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isPublicApiRoute, isPublicRoute } from '@/lib/auth-routes';
import { decrypt } from '@/lib/session-core';
import { updateSession } from '@/lib/session';

const BRAND_ICON_PATH = '/api/settings/branding/icon';

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname === '/favicon.ico') {
    return NextResponse.redirect(new URL(BRAND_ICON_PATH, request.nextUrl));
  }

  const pageIsPublic = isPublicRoute(pathname);
  const apiIsPublic = isPublicApiRoute(pathname);

  if (apiIsPublic) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get('session')?.value;
  const session = sessionCookie ? await decrypt(sessionCookie).catch(() => null) : null;

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return pageIsPublic
      ? NextResponse.next()
      : NextResponse.redirect(new URL('/login', request.nextUrl));
  }

  if (pageIsPublic) {
    return NextResponse.redirect(new URL('/dashboard', request.nextUrl));
  }

  return (await updateSession(request)) ?? NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
