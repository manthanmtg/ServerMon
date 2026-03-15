import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import EndpointExecutionLog from '@/models/EndpointExecutionLog';

export const dynamic = 'force-dynamic';

const log = createLogger('api:endpoints:logs');

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const { id } = await params;

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 100);
    const offset = Number(searchParams.get('offset')) || 0;
    const status = searchParams.get('status');

    const filter: Record<string, unknown> = { endpointId: id };
    if (status === 'success') filter.statusCode = { $gte: 200, $lt: 300 };
    if (status === 'error') filter.statusCode = { $gte: 400 };

    const [logs, total] = await Promise.all([
      EndpointExecutionLog.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(),
      EndpointExecutionLog.countDocuments(filter),
    ]);

    return NextResponse.json({ logs, total });
  } catch (error) {
    log.error('Failed to fetch execution logs', error);
    return NextResponse.json({ error: 'Failed to fetch execution logs' }, { status: 500 });
  }
}
