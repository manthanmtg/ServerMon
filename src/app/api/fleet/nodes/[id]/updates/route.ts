import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Node from '@/models/Node';
import { getSession } from '@/lib/session';
import { createLogger } from '@/lib/logger';
import { enforceRbac } from '@/lib/fleet/rbac';
import crypto from 'node:crypto';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:nodes:updates');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

/**
 * Endpoint to trigger an agent update.
 * Queues an 'update' command which will be picked up by the agent on its next heartbeat.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getSession()) as SessionUser | null;
    const rbacResp = enforceRbac(session?.user, 'can_mutate_node_config');
    if (rbacResp) return rbacResp;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const node = await Node.findById(id);
    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    // Queue the update command
    await Node.updateOne(
      { _id: id },
      {
        $push: {
          pendingCommands: {
            id: crypto.randomBytes(8).toString('hex'),
            command: 'update',
            issuedAt: new Date(),
          },
        },
      }
    );

    log.info(`Queued update command for node ${id} (${node.name})`);

    return NextResponse.json({ ok: true, queued: true });
  } catch (error) {
    log.error('Failed to queue agent update', error);
    return NextResponse.json({ error: 'Failed to queue update' }, { status: 500 });
  }
}
