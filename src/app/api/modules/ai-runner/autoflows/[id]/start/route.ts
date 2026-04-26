import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIRunnerService } from '@/lib/ai-runner/service';
import { requireSession } from '../../../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:autoflows:start');

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const autoflow = await getAIRunnerService().startAutoflow(id);
    if (!autoflow) return NextResponse.json({ error: 'Autoflow not found' }, { status: 404 });
    return NextResponse.json(autoflow);
  } catch (error) {
    log.error('Failed to start AI runner autoflow', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start autoflow' },
      { status: 400 }
    );
  }
}
