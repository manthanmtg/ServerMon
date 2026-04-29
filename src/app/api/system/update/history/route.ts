import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { systemUpdateService } from '@/lib/updates/system-service';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:system:update:history');

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const history = await systemUpdateService.listUpdateRuns();
    return NextResponse.json(history);
  } catch (error) {
    log.error('Failed to list system update history', error);
    return NextResponse.json({ error: 'Failed to list update history' }, { status: 500 });
  }
}
