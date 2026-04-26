import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIRunnerService } from '@/lib/ai-runner/service';
import { requireSession } from '../../../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:autoflows:cancel');

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const autoflow = await getAIRunnerService().cancelAutoflow(id);
    if (!autoflow) return NextResponse.json({ error: 'Autoflow not found' }, { status: 404 });
    return NextResponse.json(autoflow);
  } catch (error) {
    log.error('Failed to cancel AI runner autoflow', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel autoflow' },
      { status: 400 }
    );
  }
}
