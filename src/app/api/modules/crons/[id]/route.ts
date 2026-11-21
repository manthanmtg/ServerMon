import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { cronsService } from '@/lib/crons/service';
import { getSession } from '@/lib/session';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const log = createLogger('api:crons:job');

const CronUpdateSchema = z.object({
  minute: z.string().optional(),
  hour: z.string().optional(),
  dayOfMonth: z.string().optional(),
  month: z.string().optional(),
  dayOfWeek: z.string().optional(),
  command: z.string().optional(),
  comment: z.string().optional(),
  enabled: z.boolean().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = CronUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const result = await cronsService.updateJob(id, parsed.data);

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    log.error('Failed to update cron job', error);
    return NextResponse.json({ error: 'Failed to update cron job' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const result = await cronsService.deleteJob(id);

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    log.error('Failed to delete cron job', error);
    return NextResponse.json({ error: 'Failed to delete cron job' }, { status: 500 });
  }
}
