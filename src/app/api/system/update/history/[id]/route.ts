import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { systemUpdateService } from '@/lib/updates/system-service';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:system:update:history:detail');

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const details = await systemUpdateService.getUpdateRunDetails(id);

    if (!details) {
      return NextResponse.json({ error: 'Update run not found' }, { status: 404 });
    }

    return NextResponse.json(details);
  } catch (error) {
    log.error('Failed to get system update run details', error);
    return NextResponse.json({ error: 'Failed to get update run details' }, { status: 500 });
  }
}
