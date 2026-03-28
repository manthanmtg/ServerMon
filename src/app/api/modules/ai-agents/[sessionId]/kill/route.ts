import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIAgentsService } from '@/lib/ai-agents/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-agents:kill');

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const result = await getAIAgentsService().killSession(sessionId);
    if (!result) {
      return NextResponse.json(
        { error: 'Session not found or could not be killed' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Failed to kill session', error);
    return NextResponse.json({ error: 'Failed to kill session' }, { status: 500 });
  }
}
