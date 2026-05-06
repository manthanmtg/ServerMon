import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { cronsService } from '@/lib/crons/service';
import { getSession } from '@/lib/session';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const log = createLogger('api:crons:create');

const CronCreateSchema = z.object({
  minute: z.string().min(1),
  hour: z.string().min(1),
  dayOfMonth: z.string().min(1),
  month: z.string().min(1),
  dayOfWeek: z.string().min(1),
  command: z.string().min(1),
  comment: z.string().optional(),
  user: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const parsed = CronCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const result = await cronsService.createJob(parsed.data);

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (error) {
    log.error('Failed to create cron job', error);
    return NextResponse.json({ error: 'Failed to create cron job' }, { status: 500 });
  }
}
