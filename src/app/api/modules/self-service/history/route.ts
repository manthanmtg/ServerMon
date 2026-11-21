import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';
import { getAllJobs } from '@/modules/self-service/engine/job-manager';

export const dynamic = 'force-dynamic';

const log = createLogger('api:self-service:history');

async function requireAdmin() {
  const session = (await getSession()) as { user?: { role?: string } } | null;
  return session?.user?.role === 'admin';
}

export async function GET() {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const jobs = getAllJobs();
    return NextResponse.json({ jobs, total: jobs.length });
  } catch (error) {
    log.error('Failed to fetch install history', error);
    return NextResponse.json({ error: 'Failed to fetch install history' }, { status: 500 });
  }
}
