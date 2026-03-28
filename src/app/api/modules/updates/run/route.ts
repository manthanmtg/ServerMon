import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { systemUpdateService } from '@/lib/updates/system-service';

import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:updates:run');

// GET — list runs or get details for a specific run
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('runId');

    if (runId) {
      const details = await systemUpdateService.getUpdateRunDetails(runId);
      if (!details) {
        return NextResponse.json({ error: 'Run not found' }, { status: 404 });
      }
      return NextResponse.json(details);
    }

    const runs = await systemUpdateService.listUpdateRuns();
    return NextResponse.json({ runs });
  } catch (error) {
    log.error('Failed to fetch update runs', error);
    return NextResponse.json({ error: 'Failed to fetch update runs' }, { status: 500 });
  }
}

// POST — trigger an update
// Body: { type: "packages" } for system package update, omit or "servermon" for ServerMon self-update
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let type = 'servermon';
    try {
      const body = await request.json();
      if (body?.type === 'packages') type = 'packages';
    } catch {
      // no body — default to servermon
    }

    log.info(`Manual ${type} update triggered via API`);
    const result =
      type === 'packages'
        ? await systemUpdateService.triggerSystemPackageUpdate()
        : await systemUpdateService.triggerUpdate();

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
        pid: result.pid,
        runId: result.runId,
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
