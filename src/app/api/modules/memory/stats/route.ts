import { NextResponse } from 'next/server';
import { memoryService } from '@/lib/memory/service';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';

const log = createLogger('api:memory');

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const stats = await memoryService.getDetailedStats();
        return NextResponse.json(stats);
    } catch (err: unknown) {
        log.error('Failed to fetch memory stats', err);
        return NextResponse.json({ error: 'Failed to fetch memory stats' }, { status: 500 });
    }
}
