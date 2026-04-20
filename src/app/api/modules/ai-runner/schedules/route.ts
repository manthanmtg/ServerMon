import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAIRunnerService } from '@/lib/ai-runner/service';
import { scheduleCreateSchema } from '@/lib/ai-runner/schemas';
import { parseBody, requireSession, zodErrorResponse } from '../_shared';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:schedules');

export async function GET(request: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(request.url);
    const enabledParam = searchParams.get('enabled');
    const limit = searchParams.get('limit');
    const schedules = await getAIRunnerService().listSchedules({
      enabled: enabledParam === null ? undefined : enabledParam === 'true',
      limit: limit ? Number(limit) : undefined,
    });
    return NextResponse.json(schedules);
  } catch (error) {
    log.error('Failed to list AI runner schedules', error);
    return NextResponse.json({ error: 'Failed to list schedules' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const body = await parseBody(request, scheduleCreateSchema);
    const schedule = await getAIRunnerService().createSchedule(body);
    return NextResponse.json(schedule, { status: 201 });
  } catch (error) {
    const zodResponse = zodErrorResponse(error);
    if (zodResponse) return zodResponse;
    log.error('Failed to create AI runner schedule', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create schedule' },
      { status: 400 }
    );
  }
}
