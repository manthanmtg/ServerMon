import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { aiAgentsService } from '@/lib/ai-agents/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-agents:session');

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    try {
        const { sessionId } = await params;
        const session = await aiAgentsService.getSession(sessionId);
        if (!session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }
        return NextResponse.json(session);
    } catch (error) {
        log.error('Failed to fetch session', error);
        return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 });
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    try {
        const { sessionId } = await params;
        const result = await aiAgentsService.terminateSession(sessionId);
        if (!result) {
            return NextResponse.json({ error: 'Session not found or could not be terminated' }, { status: 404 });
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        log.error('Failed to terminate session', error);
        return NextResponse.json({ error: 'Failed to terminate session' }, { status: 500 });
    }
}
