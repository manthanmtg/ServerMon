import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIRunnerService } from '@/lib/ai-runner/service';
import { requireSession } from '../../../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:schedules:toggle');

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await params;
    const schedule = await getAIRunnerService().toggleSchedule(id);
    if (!schedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }
    return NextResponse.json(schedule);
  } catch (error) {
    log.error('Failed to toggle AI runner schedule', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to toggle schedule' },
      { status: 400 }
    );
  }
}
