import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import { dockerService } from '@/lib/docker/service';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:docker:action');

const actionSchema = z.object({
  action: z.enum(['start', 'stop', 'restart', 'remove']),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ containerId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { containerId } = await context.params;
    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid action payload' }, { status: 400 });
    }

    const result = await dockerService.performAction(containerId, parsed.data.action);
    return NextResponse.json(result);
  } catch (error) {
    log.error('Failed to execute docker action', error);
    const message = error instanceof Error ? error.message : 'Failed to execute action';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
