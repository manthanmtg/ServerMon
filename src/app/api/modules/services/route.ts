import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { servicesService } from '@/lib/services/service';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:services');

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const snapshot = await servicesService.getSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    log.error('Failed to fetch services snapshot', error);
    return NextResponse.json({ error: 'Failed to fetch services snapshot' }, { status: 500 });
  }
}
