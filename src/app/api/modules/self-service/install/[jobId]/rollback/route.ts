import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';
import { rollbackJob } from '@/modules/self-service/engine/job-manager';

export const dynamic = 'force-dynamic';

const log = createLogger('api:self-service:rollback');

async function requireAdmin() {
  const session = (await getSession()) as { user?: { role?: string } } | null;
  return session?.user?.role === 'admin';
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = await params;
    const result = rollbackJob(jobId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    log.info(`Rollback initiated for job ${jobId}`);
    return NextResponse.json({ success: true, message: 'Rollback initiated' });
  } catch (error) {
    log.error('Failed to initiate rollback', error);
    return NextResponse.json({ error: 'Failed to initiate rollback' }, { status: 500 });
  }
}
