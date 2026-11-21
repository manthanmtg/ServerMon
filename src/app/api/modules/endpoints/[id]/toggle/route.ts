import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import { getSession } from '@/lib/session';
import CustomEndpoint from '@/models/CustomEndpoint';

export const dynamic = 'force-dynamic';

const log = createLogger('api:endpoints:toggle');

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const endpoint = await CustomEndpoint.findById(id);
    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint not found' }, { status: 404 });
    }

    endpoint.enabled = !endpoint.enabled;
    await endpoint.save();

    log.info(`Endpoint ${endpoint.slug} ${endpoint.enabled ? 'enabled' : 'disabled'}`);

    return NextResponse.json({ enabled: endpoint.enabled });
  } catch (error) {
    log.error('Failed to toggle endpoint', error);
    return NextResponse.json({ error: 'Failed to toggle endpoint' }, { status: 500 });
  }
}
