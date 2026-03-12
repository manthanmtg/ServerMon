import { NextRequest, NextResponse } from 'next/server';
import { decrypt } from '@/lib/session';

const publicRoutes = ['/login', '/setup'];

export default async function middleware(req: NextRequest) {
    const path = req.nextUrl.pathname;
    const isPublicRoute = publicRoutes.some(route => path === route);

    const cookie = req.cookies.get('session')?.value;
    const session = cookie ? await decrypt(cookie).catch(() => null) : null;

    if (!isPublicRoute && !session) {
        return NextResponse.redirect(new URL('/login', req.nextUrl));
    }

    if (isPublicRoute && session) {
        return NextResponse.redirect(new URL('/dashboard', req.nextUrl));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
