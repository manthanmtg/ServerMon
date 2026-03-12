import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { servicesService } from '@/lib/services/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:services');

export async function GET() {
    try {
        const snapshot = await servicesService.getSnapshot();
        return NextResponse.json(snapshot);
    } catch (error) {
        log.error('Failed to fetch services snapshot', error);
        return NextResponse.json({ error: 'Failed to fetch services snapshot' }, { status: 500 });
    }
}
