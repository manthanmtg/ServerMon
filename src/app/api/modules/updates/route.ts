import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { updateService } from '@/lib/updates/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:updates');

export async function GET() {
    try {
        const snapshot = await updateService.getSnapshot();
        return NextResponse.json(snapshot);
    } catch (error) {
        log.error('Failed to fetch updates', error);
        return NextResponse.json({ error: 'Failed to fetch updates' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const snapshot = await updateService.getSnapshot(body.force === true);
        return NextResponse.json(snapshot);
    } catch (error) {
        log.error('Failed to trigger update check', error);
        return NextResponse.json({ error: 'Failed to trigger update check' }, { status: 500 });
    }
}
