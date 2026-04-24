import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import Node from '@/models/Node';
import FleetLogEvent from '@/models/FleetLogEvent';
import { recordAudit } from '@/lib/fleet/audit';
import { getSession } from '@/lib/session';
import { enforceRbac } from '@/lib/fleet/rbac';
import type { Model } from 'mongoose';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:nodes:maintenance');

const MaintenanceBodyZ = z.object({
  enabled: z.boolean(),
  reason: z.string().max(200).optional(),
  until: z.coerce.date().optional(),
});

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getSession()) as SessionUser | null;
    const rbacResp = enforceRbac(session?.user, 'can_mutate_node_config');
    if (rbacResp) return rbacResp;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const raw = await req.json();
    const body = MaintenanceBodyZ.parse(raw);

    const node = await Node.findById(id);
    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    node.maintenance = {
      enabled: body.enabled,
      reason: body.reason,
      until: body.until,
    };
    await node.save();

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'node.maintenance_toggle',
      actorUserId: session.user.username,
      nodeId: id,
      metadata: { enabled: body.enabled, reason: body.reason },
    });

    return NextResponse.json({ node: node.toObject() });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to toggle maintenance', error);
    return NextResponse.json({ error: 'Failed to toggle maintenance' }, { status: 500 });
  }
}
