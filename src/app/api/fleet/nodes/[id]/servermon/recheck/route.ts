import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import Node from '@/models/Node';
import { getSession } from '@/lib/session';
import { enforceRbac } from '@/lib/fleet/rbac';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:nodes:servermon:recheck');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getSession()) as SessionUser | null;
    const rbacResp = enforceRbac(session?.user, 'can_view_fleet');
    if (rbacResp) return rbacResp;

    await connectDB();
    const { id } = await params;
    const node = await Node.findById(id);
    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    await Node.updateOne(
      { _id: id },
      {
        $push: {
          pendingCommands: {
            id: crypto.randomBytes(8).toString('hex'),
            command: 'servermon-recheck',
            issuedAt: new Date(),
          },
        },
      }
    );

    return NextResponse.json({ ok: true, queued: true });
  } catch (error) {
    log.error('Failed to queue ServerMon recheck', error);
    return NextResponse.json({ error: 'Failed to queue ServerMon recheck' }, { status: 500 });
  }
}
