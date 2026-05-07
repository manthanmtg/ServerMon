import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { systemUpdateService } from '@/lib/updates/system-service';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:system:update:history');

export async function GET(request?: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const type = request ? new URL(request.url).searchParams.get('type') : null;
    const history = await systemUpdateService.listUpdateRuns();
    return NextResponse.json(
      type === 'servermon' || type === 'agent'
        ? history.filter((run) => run.type === type)
        : history
    );
  } catch (error) {
    log.error('Failed to list system update history', error);
    return NextResponse.json({ error: 'Failed to list update history' }, { status: 500 });
  }
}
