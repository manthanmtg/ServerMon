import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIRunnerService } from '@/lib/ai-runner/service';
import { autoflowUpdateSchema } from '@/lib/ai-runner/schemas';
import { parseBody, requireSession, zodErrorResponse } from '../../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:autoflows:id');

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const body = await parseBody(request, autoflowUpdateSchema);
    const autoflow = await getAIRunnerService().updateAutoflow(id, body);
    if (!autoflow) return NextResponse.json({ error: 'Autoflow not found' }, { status: 404 });
    return NextResponse.json(autoflow);
  } catch (error) {
    const zodResponse = zodErrorResponse(error);
    if (zodResponse) return zodResponse;
    log.error('Failed to update AI runner autoflow', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update autoflow' },
      { status: 400 }
    );
  }
}
