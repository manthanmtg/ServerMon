import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { dockerService } from '@/lib/docker/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:docker:container');

export async function GET(_: Request, context: { params: Promise<{ containerId: string }> }) {
    try {
        const { containerId } = await context.params;
        const snapshot = await dockerService.getSnapshot();
        const container = snapshot.containers.find((entry) => entry.id === containerId);
        if (!container) {
            return NextResponse.json({ error: 'Container not found' }, { status: 404 });
        }
        return NextResponse.json({ container });
    } catch (error) {
        log.error('Failed to fetch docker container detail', error);
        return NextResponse.json({ error: 'Failed to fetch container detail' }, { status: 500 });
    }
}
