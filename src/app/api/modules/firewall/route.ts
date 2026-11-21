import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { firewallService } from '@/lib/firewall/service';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:firewall');

export async function GET() {
  try {
    const session = (await getSession()) as { user?: { role?: string } } | null;
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const snapshot = await firewallService.getSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    log.error('Failed to fetch firewall snapshot', error);
    return NextResponse.json({ error: 'Failed to fetch firewall snapshot' }, { status: 500 });
  }
}
