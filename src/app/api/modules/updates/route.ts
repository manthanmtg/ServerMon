import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import { updateService } from '@/lib/updates/service';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:updates');
const UpdateSnapshotBodySchema = z.object({ force: z.boolean().optional() });

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const snapshot = await updateService.getSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    log.error('Failed to fetch updates', error);
    return NextResponse.json({ error: 'Failed to fetch updates' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = UpdateSnapshotBodySchema.parse(await request.json().catch(() => ({})));
    const snapshot = await updateService.getSnapshot(body.force === true);
    return NextResponse.json(snapshot);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: error.issues
            .map((issue) => `${issue.path.join('.') || 'request'}: ${issue.message}`)
            .join(', '),
        },
        { status: 400 }
      );
    }

    log.error('Failed to trigger update check', error);
    return NextResponse.json({ error: 'Failed to trigger update check' }, { status: 500 });
  }
}
