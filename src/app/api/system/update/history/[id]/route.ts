import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { updateService } from '@/lib/updates/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:system:update:history:detail');

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const details = await updateService.getUpdateRunDetails(id);
        
        if (!details) {
            return NextResponse.json({ error: 'Update run not found' }, { status: 404 });
        }
        
        return NextResponse.json(details);
    } catch (error) {
        log.error('Failed to get system update run details', error);
        return NextResponse.json({ error: 'Failed to get update run details' }, { status: 500 });
    }
}
