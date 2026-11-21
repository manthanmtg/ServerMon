import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { servicesService } from '@/lib/services/service';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:services:logs');

export async function GET(request: Request, context: { params: Promise<{ serviceName: string }> }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { serviceName } = await context.params;
    const url = new URL(request.url);
    const lines = Math.min(Number(url.searchParams.get('lines')) || 50, 500);

    const logs = await servicesService.getServiceLogs(serviceName, lines);
    return NextResponse.json({ logs });
  } catch (error) {
    log.error('Failed to fetch service logs', error);
    return NextResponse.json({ error: 'Failed to fetch service logs' }, { status: 500 });
  }
}
