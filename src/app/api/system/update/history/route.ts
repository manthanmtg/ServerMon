import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { updateService } from '@/lib/updates/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:system:update:history');

export async function GET() {
    try {
        const history = await updateService.listUpdateRuns();
        return NextResponse.json(history);
    } catch (error) {
        log.error('Failed to list system update history', error);
        return NextResponse.json({ error: 'Failed to list update history' }, { status: 500 });
    }
}
