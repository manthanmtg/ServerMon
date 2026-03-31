import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getJob, cancelJob } from '@/modules/self-service/engine/job-manager';

export const dynamic = 'force-dynamic';

const log = createLogger('api:self-service:job');

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;
    const job = getJob(jobId);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({ job });
  } catch (error) {
    log.error('Failed to fetch job status', error);
    return NextResponse.json({ error: 'Failed to fetch job status' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;
    const result = cancelJob(jobId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    log.info(`Job ${jobId} cancelled`);
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Failed to cancel job', error);
    return NextResponse.json({ error: 'Failed to cancel job' }, { status: 500 });
  }
}
