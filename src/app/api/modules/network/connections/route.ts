import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { networkService } from '@/lib/network/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:network:connections');

export async function GET() {
  try {
    const snapshot = await networkService.getSnapshot();
    return NextResponse.json(snapshot.connections);
  } catch (error) {
    log.error('Failed to fetch network connections', error);
    return NextResponse.json({ error: 'Failed to fetch network connections' }, { status: 500 });
  }
}
