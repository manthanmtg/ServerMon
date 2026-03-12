import { NextResponse } from 'next/server';
import { analyticsService } from '@/lib/analytics';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:analytics');

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 500);

    try {
        const events = await analyticsService.getRecentEvents(limit);
        return NextResponse.json({ events });
    } catch (error: unknown) {
        log.error('Failed to fetch analytics events', error);
        return NextResponse.json(
            { error: 'Failed to retrieve events' },
            { status: 500 }
        );
    }
}
