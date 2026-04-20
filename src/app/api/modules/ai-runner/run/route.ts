import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIRunnerService } from '@/lib/ai-runner/service';
import { runExecuteSchema } from '@/lib/ai-runner/schemas';
import { parseBody, requireSession, zodErrorResponse } from '../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:run');

export async function POST(request: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const body = await parseBody(request, runExecuteSchema);
    const run = await getAIRunnerService().executeRun(body);
    return NextResponse.json(run, { status: 201 });
  } catch (error) {
    const zodResponse = zodErrorResponse(error);
    if (zodResponse) return zodResponse;
    log.error('Failed to start AI runner run', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to execute run' },
      { status: 400 }
    );
  }
}
