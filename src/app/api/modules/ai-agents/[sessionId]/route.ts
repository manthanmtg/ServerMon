import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIAgentsService } from '@/lib/ai-agents/service';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-agents:session');

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const authSession = await getSession();
    if (!authSession) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = await params;
    const session = await getAIAgentsService().getSession(sessionId);
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
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = await params;
    const result = await getAIAgentsService().terminateSession(sessionId);
    if (!result) {
      return NextResponse.json(
        { error: 'Session not found or could not be terminated' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Failed to terminate session', error);
    return NextResponse.json({ error: 'Failed to terminate session' }, { status: 500 });
  }
}
