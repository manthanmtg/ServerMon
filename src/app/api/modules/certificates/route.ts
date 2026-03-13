import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { certificatesService } from '@/lib/certificates/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:certificates');

export async function GET() {
    try {
        const snapshot = await certificatesService.getSnapshot();
        return NextResponse.json(snapshot);
    } catch (error) {
        log.error('Failed to fetch certificates snapshot', error);
        return NextResponse.json({ error: 'Failed to fetch certificates snapshot' }, { status: 500 });
    }
}
