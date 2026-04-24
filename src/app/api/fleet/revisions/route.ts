import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import ConfigRevision from '@/models/ConfigRevision';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:revisions');

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
    const kind = searchParams.get('kind') || '';
    const targetId = searchParams.get('targetId') || '';
    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 50, 1), 200);
    const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

    const filter: Record<string, unknown> = {};
    if (kind) filter.kind = kind;
    if (targetId) filter.targetId = targetId;

    const [revisions, total] = await Promise.all([
      ConfigRevision.find(filter).sort({ version: -1 }).skip(offset).limit(limit).lean(),
      ConfigRevision.countDocuments(filter),
    ]);

    return NextResponse.json({ revisions, total });
  } catch (error) {
    log.error('Failed to fetch revisions', error);
    return NextResponse.json({ error: 'Failed to fetch revisions' }, { status: 500 });
  }
}
