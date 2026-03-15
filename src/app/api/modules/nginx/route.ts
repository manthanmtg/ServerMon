import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { nginxService } from '@/lib/nginx/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:nginx');

export async function GET() {
  try {
    const snapshot = await nginxService.getSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    log.error('Failed to fetch nginx snapshot', error);
    return NextResponse.json({ error: 'Failed to fetch nginx snapshot' }, { status: 500 });
  }
}
