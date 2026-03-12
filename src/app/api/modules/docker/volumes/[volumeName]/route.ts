import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { dockerService } from '@/lib/docker/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:docker:volumes');

export async function DELETE(
    _request: Request,
    context: { params: Promise<{ volumeName: string }> }
) {
    try {
        const { volumeName } = await context.params;
        const result = await dockerService.removeVolume(volumeName);
        return NextResponse.json(result);
    } catch (error) {
        log.error('Failed to remove docker volume', error);
        return NextResponse.json({ error: 'Failed to remove volume' }, { status: 500 });
    }
}
