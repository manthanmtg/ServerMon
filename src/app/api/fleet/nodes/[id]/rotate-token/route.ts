import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import Node from '@/models/Node';
import FleetLogEvent from '@/models/FleetLogEvent';
import { generatePairingToken, hashPairingToken } from '@/lib/fleet/pairing';
import { recordAudit } from '@/lib/fleet/audit';
import { getSession } from '@/lib/session';
import { enforceRbac } from '@/lib/fleet/rbac';
import type { Model } from 'mongoose';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:nodes:rotate-token');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getSession()) as SessionUser | null;
    const rbacResp = enforceRbac(session?.user, 'can_rotate_tokens');
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

    const pairingToken = generatePairingToken();
    const pairingTokenHash = await hashPairingToken(pairingToken);
    const pairingTokenPrefix = pairingToken.slice(0, 8);
    const now = new Date();

    node.pairingTokenHash = pairingTokenHash;
    node.pairingTokenPrefix = pairingTokenPrefix;
    node.pairingIssuedAt = now;
    node.pairingVerifiedAt = null;
    node.status = 'unpaired';
    await node.save();

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'node.rotate_token',
      actorUserId: session.user.username,
      nodeId: id,
    });

    return NextResponse.json({ pairingToken });
  } catch (error) {
    log.error('Failed to rotate pairing token', error);
    return NextResponse.json({ error: 'Failed to rotate pairing token' }, { status: 500 });
  }
}
