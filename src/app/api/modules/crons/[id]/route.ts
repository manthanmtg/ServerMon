import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { cronsService } from '@/lib/crons/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:crons:job');

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json();

        const result = await cronsService.updateJob(id, body);

        if (!result.success) {
            return NextResponse.json({ error: result.message }, { status: 400 });
        }

        return NextResponse.json(result);
    } catch (error) {
        log.error('Failed to update cron job', error);
        return NextResponse.json({ error: 'Failed to update cron job' }, { status: 500 });
    }
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
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
