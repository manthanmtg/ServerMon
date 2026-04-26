import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIRunnerService } from '@/lib/ai-runner/service';
import { autoflowCreateSchema } from '@/lib/ai-runner/schemas';
import { parseBody, requireSession, zodErrorResponse } from '../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:autoflows');

export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    return NextResponse.json(await getAIRunnerService().listAutoflows());
  } catch (error) {
    log.error('Failed to list AI runner autoflows', error);
    return NextResponse.json({ error: 'Failed to list autoflows' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const body = await parseBody(request, autoflowCreateSchema);
    const autoflow = await getAIRunnerService().createAutoflow(body);
    return NextResponse.json(autoflow, { status: 201 });
  } catch (error) {
    const zodResponse = zodErrorResponse(error);
    if (zodResponse) return zodResponse;
    log.error('Failed to create AI runner autoflow', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create autoflow' },
      { status: 400 }
    );
  }
}
