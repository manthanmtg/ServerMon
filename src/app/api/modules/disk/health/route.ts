import { NextResponse } from 'next/server';
import si from 'systeminformation';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:disk:health');

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const [diskLayout, blockDevices] = await Promise.all([
            si.diskLayout(),
            si.blockDevices(),
        ]);

        return NextResponse.json({
            layout: diskLayout,
            devices: blockDevices,
        });
    } catch (error) {
        log.error('Failed to fetch disk health/layout', error);
        return NextResponse.json({ error: 'Failed to fetch disk health' }, { status: 500 });
    }
}
