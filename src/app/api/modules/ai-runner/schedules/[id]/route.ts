import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIRunnerService } from '@/lib/ai-runner/service';
import { scheduleUpdateSchema } from '@/lib/ai-runner/schemas';
import { parseBody, requireSession, zodErrorResponse } from '../../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:schedules:id');

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await params;
    const body = await parseBody(request, scheduleUpdateSchema);
    const schedule = await getAIRunnerService().updateSchedule(id, body);
    if (!schedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }
    return NextResponse.json(schedule);
  } catch (error) {
    const zodResponse = zodErrorResponse(error);
    if (zodResponse) return zodResponse;
    log.error('Failed to update AI runner schedule', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update schedule' },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await params;
    const deleted = await getAIRunnerService().deleteSchedule(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Failed to delete AI runner schedule', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete schedule' },
      { status: 400 }
    );
  }
}
