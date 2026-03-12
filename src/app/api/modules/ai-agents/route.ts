import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { aiAgentsService } from '@/lib/ai-agents/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-agents');

export async function GET() {
    try {
        const snapshot = await aiAgentsService.getSnapshot();
        return NextResponse.json(snapshot);
    } catch (error) {
        log.error('Failed to fetch AI agents snapshot', error);
        return NextResponse.json({ error: 'Failed to fetch AI agents snapshot' }, { status: 500 });
    }
}
