import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { cronsService } from '@/lib/crons/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:crons:run');

// POST — trigger a manual run for a cron job
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // Find the job to get its command
        const snapshot = await cronsService.getSnapshot();
        const job = snapshot.jobs.find(j => j.id === id);

        if (!job) {
            return NextResponse.json({ error: 'Cron job not found' }, { status: 404 });
        }

        if (job.source !== 'user') {
            return NextResponse.json({ error: 'Only user cron jobs can be run manually' }, { status: 403 });
        }

        const run = cronsService.runJobNow(id, job.command);
        return NextResponse.json({ success: true, run });
    } catch (error) {
        log.error('Failed to trigger manual cron run', error);
        return NextResponse.json({ error: 'Failed to trigger manual run' }, { status: 500 });
    }
}

// GET — check status of runs for a job
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const url = new URL(req.url);
        const runId = url.searchParams.get('runId');

        if (runId) {
            const run = await cronsService.getRunStatus(runId);
            if (!run) {
                return NextResponse.json({ error: 'Run not found' }, { status: 404 });
            }
            return NextResponse.json(run);
        }

        const runs = cronsService.listRuns(id);
        return NextResponse.json({ runs });
    } catch (error) {
        log.error('Failed to get run status', error);
        return NextResponse.json({ error: 'Failed to get run status' }, { status: 500 });
    }
}
