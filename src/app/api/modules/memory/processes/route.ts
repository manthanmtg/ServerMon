import { NextResponse } from 'next/server';
import { memoryService } from '@/lib/memory/service';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';

const log = createLogger('api:memory:processes');

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);

    const processes = await memoryService.getTopMemoryProcesses(limit);
    return NextResponse.json(processes);
  } catch (err: unknown) {
    log.error('Failed to fetch top memory processes', err);
    return NextResponse.json({ error: 'Failed to fetch memory processes' }, { status: 500 });
  }
}
