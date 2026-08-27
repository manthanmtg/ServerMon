import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { networkService } from '@/lib/network/service';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:network:connections');

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const snapshot = await networkService.getSnapshot();
    return NextResponse.json(snapshot.connections);
  } catch (error) {
    log.error('Failed to fetch network connections', error);
    return NextResponse.json({ error: 'Failed to fetch network connections' }, { status: 500 });
  }
}
