import { NextResponse } from 'next/server';
import { analyticsService } from '@/lib/analytics';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');

    try {
        const events = await analyticsService.getRecentEvents(limit);
        return NextResponse.json({ events });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
