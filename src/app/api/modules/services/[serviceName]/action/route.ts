import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import { servicesService } from '@/lib/services/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:services:action');

const actionSchema = z.object({
    action: z.enum(['start', 'stop', 'restart', 'enable', 'disable', 'reload']),
});

export async function POST(request: Request, context: { params: Promise<{ serviceName: string }> }) {
    try {
        const { serviceName } = await context.params;
        const parsed = actionSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid action payload' }, { status: 400 });
        }

        const result = await servicesService.performAction(serviceName, parsed.data.action);
        if (!result.success) {
            return NextResponse.json({ error: result.message }, { status: 500 });
        }
        return NextResponse.json(result);
    } catch (error) {
        log.error('Failed to execute service action', error);
        return NextResponse.json({ error: 'Failed to execute action' }, { status: 500 });
    }
}
