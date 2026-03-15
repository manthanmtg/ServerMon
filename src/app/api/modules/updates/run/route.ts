import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { systemUpdateService } from '@/lib/updates/system-service';

import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:updates:run');

// POST — trigger a manual system update
export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    log.info('Manual update triggered via API');
    const result = await systemUpdateService.triggerUpdate();

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
        pid: result.pid,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.message,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    log.error('Failed to trigger update', error);
    return NextResponse.json(
      {
        error: 'Internal server error while triggering update',
      },
      { status: 500 }
    );
  }
}
