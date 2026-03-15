import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { securityService } from '@/lib/security/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:security');

export async function GET() {
  try {
    const snapshot = await securityService.getSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    log.error('Failed to fetch security snapshot', error);
    return NextResponse.json({ error: 'Failed to fetch security snapshot' }, { status: 500 });
  }
}
