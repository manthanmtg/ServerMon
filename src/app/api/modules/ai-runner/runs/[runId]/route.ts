import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIRunnerService } from '@/lib/ai-runner/service';
import { requireSession } from '../../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:runs:id');

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const { runId } = await params;
    const run = await getAIRunnerService().getRun(runId);
    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }
    return NextResponse.json(run);
  } catch (error) {
    log.error('Failed to fetch AI runner run', error);
    return NextResponse.json({ error: 'Failed to fetch run' }, { status: 500 });
  }
}
