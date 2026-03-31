import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getAllJobs } from '@/modules/self-service/engine/job-manager';

export const dynamic = 'force-dynamic';

const log = createLogger('api:self-service:history');

export async function GET() {
  try {
    const jobs = getAllJobs();
    return NextResponse.json({ jobs, total: jobs.length });
  } catch (error) {
    log.error('Failed to fetch install history', error);
    return NextResponse.json({ error: 'Failed to fetch install history' }, { status: 500 });
  }
}
