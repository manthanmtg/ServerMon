import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { dockerService } from '@/lib/docker/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:docker');

export async function GET() {
  try {
    const snapshot = await dockerService.getSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    log.error('Failed to fetch docker snapshot', error);
    return NextResponse.json({ error: 'Failed to fetch docker snapshot' }, { status: 500 });
  }
}
