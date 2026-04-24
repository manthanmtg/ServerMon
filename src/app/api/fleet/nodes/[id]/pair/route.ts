import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import Node from '@/models/Node';
import FleetLogEvent from '@/models/FleetLogEvent';
import FrpServerState from '@/models/FrpServerState';
import { verifyPairingToken } from '@/lib/fleet/pairing';
import { recordAudit } from '@/lib/fleet/audit';
import type { Model } from 'mongoose';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:nodes:pair');

function extractBearer(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!auth) return null;
  const match = /^Bearer (.+)$/.exec(auth);
  return match ? match[1] : null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = extractBearer(req);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const node = await Node.findById(id);
    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    if (!node.pairingTokenHash) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const valid = await verifyPairingToken(token, node.pairingTokenHash);
    if (!valid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const frpServer = await FrpServerState.findOne({ key: 'global' });
    if (!frpServer || !frpServer.enabled) {
      return NextResponse.json(
        { error: 'FRP server is not configured or disabled' },
        { status: 503 }
      );
    }

    const now = new Date();
    node.status = 'connecting';
    node.pairingVerifiedAt = now;
    node.tunnelStatus = 'disconnected';
    await node.save();

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'node.pair_verified',
      nodeId: id,
    });

    const authToken = process.env.FLEET_HUB_AUTH_TOKEN ?? 'placeholder-pending-config';
    const publicUrl = process.env.FLEET_HUB_PUBLIC_URL;
    const serverAddr = publicUrl ?? frpServer.subdomainHost ?? 'localhost';

    return NextResponse.json({
      hub: {
        serverAddr,
        serverPort: frpServer.bindPort,
        authToken,
        subdomainHost: frpServer.subdomainHost ?? null,
      },
    });
  } catch (error) {
    log.error('Failed to pair node', error);
    return NextResponse.json({ error: 'Failed to pair node' }, { status: 500 });
  }
}
