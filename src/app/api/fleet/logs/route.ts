import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import FleetLogEvent from '@/models/FleetLogEvent';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:logs');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

export async function GET(req: NextRequest) {
  try {
    const session = (await getSession()) as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(req.url);
    const nodeId = searchParams.get('nodeId') || '';
    const routeId = searchParams.get('routeId') || '';
    const service = searchParams.get('service') || '';
    const level = searchParams.get('level') || '';
    const eventType = searchParams.get('eventType') || '';
    const correlationId = searchParams.get('correlationId') || '';
    const since = searchParams.get('since') || '';
    const until = searchParams.get('until') || '';
    const audit = searchParams.get('audit');
    const cursor = searchParams.get('cursor') || '';
    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 100, 1), 500);

    const filter: Record<string, unknown> = {};
    if (nodeId) filter.nodeId = nodeId;
    if (routeId) filter.routeId = routeId;
    if (service) filter.service = service;
    if (level) filter.level = level;
    if (eventType) filter.eventType = eventType;
    if (correlationId) filter.correlationId = correlationId;
    if (audit === 'true') filter.audit = true;
    if (audit === 'false') filter.audit = false;

    const createdAtFilter: Record<string, Date> = {};
    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) createdAtFilter.$gte = sinceDate;
    }
    if (until) {
      const untilDate = new Date(until);
      if (!isNaN(untilDate.getTime())) createdAtFilter.$lte = untilDate;
    }
    if (Object.keys(createdAtFilter).length > 0) {
      filter.createdAt = createdAtFilter;
    }

    if (cursor) {
      filter._id = { $lt: cursor };
    }

    const events = await FleetLogEvent.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean();

    const nextCursor = events.length === limit ? String(events[events.length - 1]._id) : null;

    return NextResponse.json({ events, nextCursor });
  } catch (error) {
    log.error('Failed to fetch fleet logs', error);
    return NextResponse.json({ error: 'Failed to fetch fleet logs' }, { status: 500 });
  }
}
