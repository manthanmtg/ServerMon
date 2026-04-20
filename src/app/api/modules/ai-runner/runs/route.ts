import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIRunnerService } from '@/lib/ai-runner/service';
import { requireSession } from '../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:runs');

export async function GET(request: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(request.url);
    const result = await getAIRunnerService().listRuns({
      status: (searchParams.get('status') as never) || undefined,
      triggeredBy: (searchParams.get('triggeredBy') as never) || undefined,
      agentProfileId: searchParams.get('agentProfileId') || undefined,
      workingDirectory: searchParams.get('workingDirectory') || undefined,
      search: searchParams.get('search') || undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
      offset: searchParams.get('offset') ? Number(searchParams.get('offset')) : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    log.error('Failed to list AI runner runs', error);
    return NextResponse.json({ error: 'Failed to list runs' }, { status: 500 });
  }
}
