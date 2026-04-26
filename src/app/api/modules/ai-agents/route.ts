import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIAgentsService } from '@/lib/ai-agents/service';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-agents');

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const snapshot = await getAIAgentsService().getSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    log.error('Failed to fetch AI agents snapshot', error);
    return NextResponse.json({ error: 'Failed to fetch AI agents snapshot' }, { status: 500 });
  }
}
