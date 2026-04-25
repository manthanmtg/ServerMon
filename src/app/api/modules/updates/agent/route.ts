import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';
import { systemUpdateService } from '@/lib/updates/system-service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:updates:agent');

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const agent = await systemUpdateService.getServermonAgentStatus();
    return NextResponse.json({ agent });
  } catch (error) {
    log.error('Failed to inspect ServerMon agent', error);
    return NextResponse.json({ error: 'Failed to inspect ServerMon agent' }, { status: 500 });
  }
}
