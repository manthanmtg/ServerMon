import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { portsService } from '@/lib/ports/service';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ports');

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const snapshot = await portsService.getSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    log.error('Failed to fetch ports snapshot', error);
    return NextResponse.json({ error: 'Failed to fetch ports snapshot' }, { status: 500 });
  }
}
