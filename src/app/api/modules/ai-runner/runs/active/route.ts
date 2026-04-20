import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIRunnerService } from '@/lib/ai-runner/service';
import { requireSession } from '../../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:runs:active');

export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const runs = await getAIRunnerService().getActiveRuns();
    return NextResponse.json(runs);
  } catch (error) {
    log.error('Failed to list active AI runner runs', error);
    return NextResponse.json({ error: 'Failed to list active runs' }, { status: 500 });
  }
}
