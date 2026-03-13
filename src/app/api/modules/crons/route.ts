import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { cronsService } from '@/lib/crons/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:crons');

export async function GET() {
    try {
        const snapshot = await cronsService.getSnapshot();
        return NextResponse.json(snapshot);
    } catch (error) {
        log.error('Failed to fetch crons snapshot', error);
        return NextResponse.json({ error: 'Failed to fetch crons snapshot' }, { status: 500 });
    }
}
