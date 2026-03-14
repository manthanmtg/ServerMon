import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import CustomEndpoint from '@/models/CustomEndpoint';

export const dynamic = 'force-dynamic';

const log = createLogger('api:endpoints');

export async function GET(req: NextRequest) {
    try {
        await connectDB();

        const { searchParams } = new URL(req.url);
        const search = searchParams.get('search') || '';
        const method = searchParams.get('method') || '';
        const type = searchParams.get('type') || '';
        const tag = searchParams.get('tag') || '';
        const enabled = searchParams.get('enabled');
        const limit = Math.min(Number(searchParams.get('limit')) || 100, 200);
        const offset = Number(searchParams.get('offset')) || 0;

        const filter: Record<string, unknown> = {};

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { slug: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
            ];
        }

        if (method) filter.method = method.toUpperCase();
        if (type) filter.endpointType = type;
        if (tag) filter.tags = tag;
        if (enabled !== null && enabled !== '') filter.enabled = enabled === 'true';

        const [endpoints, total] = await Promise.all([
            CustomEndpoint.find(filter)
                .select('-tokens.hashedToken')
                .sort({ updatedAt: -1 })
                .skip(offset)
                .limit(limit)
                .lean(),
            CustomEndpoint.countDocuments(filter),
        ]);

        return NextResponse.json({ endpoints, total });
    } catch (error) {
        log.error('Failed to fetch endpoints', error);
        return NextResponse.json({ error: 'Failed to fetch endpoints' }, { status: 500 });
    }
}
