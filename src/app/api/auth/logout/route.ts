import { logout } from '@/lib/session';
import { NextResponse } from 'next/server';

export async function POST() {
    await logout();
    return NextResponse.json({ success: true });
}
