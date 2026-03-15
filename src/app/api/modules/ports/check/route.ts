import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { portsService } from '@/lib/ports/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ports:check');

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const portParam = searchParams.get('port');

    if (!portParam) {
      return NextResponse.json({ error: 'port parameter is required' }, { status: 400 });
    }

    const port = parseInt(portParam, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      return NextResponse.json({ error: 'port must be between 1 and 65535' }, { status: 400 });
    }

    const result = await portsService.checkPort(port);
    return NextResponse.json(result);
  } catch (error) {
    log.error('Failed to check port', error);
    return NextResponse.json({ error: 'Failed to check port' }, { status: 500 });
  }
}
