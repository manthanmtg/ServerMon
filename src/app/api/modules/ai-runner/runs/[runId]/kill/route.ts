import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIRunnerService } from '@/lib/ai-runner/service';
import { requireSession } from '../../../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:runs:kill');

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const { runId } = await params;
    const stopped = await getAIRunnerService().killRun(runId);
    if (!stopped) {
      return NextResponse.json({ error: 'Run not found or already finished' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Failed to kill AI runner run', error);
    return NextResponse.json({ error: 'Failed to kill run' }, { status: 500 });
  }
}
