import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { certificatesService } from '@/lib/certificates/service';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:certificates');

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const snapshot = await certificatesService.getSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    log.error('Failed to fetch certificates snapshot', error);
    return NextResponse.json({ error: 'Failed to fetch certificates snapshot' }, { status: 500 });
  }
}
