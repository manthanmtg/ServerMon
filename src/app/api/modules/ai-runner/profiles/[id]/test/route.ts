import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIRunnerService } from '@/lib/ai-runner/service';
import { requireSession } from '../../../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:profiles:test');

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await params;
    const run = await getAIRunnerService().testProfile(id);
    return NextResponse.json(run, { status: 201 });
  } catch (error) {
    log.error('Failed to test AI runner profile', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to test profile' },
      { status: 400 }
    );
  }
}
