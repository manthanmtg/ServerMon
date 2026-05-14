import { logout } from '@/lib/session';
import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const logger = createLogger('api:auth:logout');

export async function POST(_req: NextRequest) {
  try {
    await logout();
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    logger.error('Logout failed:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
