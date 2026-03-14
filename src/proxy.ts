import { NextRequest, NextResponse } from 'next/server';
import { decrypt } from '@/lib/session';

const publicRoutes = ['/login', '/setup'];
const publicApiRoutes = [
    '/api/auth/login',
    '/api/auth/logout', // Allow logouts without strict session if session is already dead
    '/api/auth/passkey',
    '/api/auth/verify',
    '/api/setup',
    '/api/endpoints', // Custom endpoints handle their own auth via tokens
];

export default async function middleware(req: NextRequest) {
    const path = req.nextUrl.pathname;
    
    // Check if it's a public route or a public API route
    const isPublicRoute = publicRoutes.some(route => path === route);
    const isPublicApiRoute = publicApiRoutes.some(route => path.startsWith(route));

    const cookie = req.cookies.get('session')?.value;
    const session = cookie ? await decrypt(cookie).catch(() => null) : null;

    // Protection logic
    if (!isPublicRoute && !isPublicApiRoute && !session) {
        if (path.startsWith('/api')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return NextResponse.redirect(new URL('/login', req.nextUrl));
    }

    // Redirect to dashboard if logged in and trying to access public routes (non-API)
    if (isPublicRoute && session) {
        return NextResponse.redirect(new URL('/dashboard', req.nextUrl));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
