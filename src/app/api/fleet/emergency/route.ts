import { NextRequest, NextResponse } from 'next/server';
import { ZodError, z } from 'zod';
import type { Model } from 'mongoose';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import Node from '@/models/Node';
import PublicRoute from '@/models/PublicRoute';
import AgentUpdateJob from '@/models/AgentUpdateJob';
import FrpServerState from '@/models/FrpServerState';
import FleetLogEvent from '@/models/FleetLogEvent';
import { generatePairingToken, hashPairingToken } from '@/lib/fleet/pairing';
import { recordAudit } from '@/lib/fleet/audit';
import { getSession } from '@/lib/session';
import { enforceRbac } from '@/lib/fleet/rbac';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:emergency');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

const BodyZ = z.object({
  action: z.enum([
    'disable_all_routes',
    'stop_all_terminals',
    'stop_all_endpoint_runs',
    'revoke_agent',
    'rotate_token',
    'rotate_all_tokens',
    'pause_updates',
    'fleet_maintenance',
    'stop_frps',
  ]),
  confirm: z.literal(true),
  reason: z.string().min(10).max(500),
  targetId: z.string().optional(),
});

type EmergencyAction = z.infer<typeof BodyZ>['action'];

interface BlastRadius {
  affectedRoutes?: number;
  affectedNodes?: number;
  affectedJobs?: number;
  affectedTokens?: number;
}

export async function POST(req: NextRequest) {
  try {
    const session = (await getSession()) as SessionUser | null;
    const rbacResp = enforceRbac(session?.user, 'can_emergency');
    if (rbacResp) return rbacResp;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const body = await req.json();
    const parsed = BodyZ.parse(body);
    const { action, reason, targetId } = parsed;

    if ((action === 'revoke_agent' || action === 'rotate_token') && !targetId) {
      return NextResponse.json({ error: `${action} requires targetId` }, { status: 400 });
    }

    const blastRadius: BlastRadius = {};
    let results: unknown = undefined;

    switch (action as EmergencyAction) {
      case 'disable_all_routes': {
        const update = await PublicRoute.updateMany({}, { status: 'disabled', enabled: false });
        blastRadius.affectedRoutes =
          (update as unknown as { modifiedCount?: number }).modifiedCount ?? 0;
        break;
      }
      case 'stop_all_terminals': {
        const nodeCount = await Node.countDocuments({});
        blastRadius.affectedNodes = nodeCount;
        break;
      }
      case 'stop_all_endpoint_runs': {
        const nodeCount = await Node.countDocuments({});
        blastRadius.affectedNodes = nodeCount;
        break;
      }
      case 'revoke_agent': {
        const node = await Node.findById(targetId);
        if (!node) {
          return NextResponse.json({ error: 'Node not found' }, { status: 404 });
        }
        node.status = 'disabled';
        node.pairingTokenHash = undefined;
        await node.save();
        blastRadius.affectedNodes = 1;
        break;
      }
      case 'rotate_token': {
        const node = await Node.findById(targetId);
        if (!node) {
          return NextResponse.json({ error: 'Node not found' }, { status: 404 });
        }
        const pairingToken = generatePairingToken();
        const pairingTokenHash = await hashPairingToken(pairingToken);
        const pairingTokenPrefix = pairingToken.slice(0, 8);
        node.pairingTokenHash = pairingTokenHash;
        node.pairingTokenPrefix = pairingTokenPrefix;
        node.pairingIssuedAt = new Date();
        node.pairingVerifiedAt = null;
        node.status = 'unpaired';
        await node.save();
        blastRadius.affectedNodes = 1;
        blastRadius.affectedTokens = 1;
        results = { pairingToken };
        break;
      }
      case 'rotate_all_tokens': {
        const nodes = await Node.find({});
        const tokens: Array<{ nodeId: string; pairingToken: string }> = [];
        for (const node of nodes) {
          const pairingToken = generatePairingToken();
          const pairingTokenHash = await hashPairingToken(pairingToken);
          node.pairingTokenHash = pairingTokenHash;
          node.pairingTokenPrefix = pairingToken.slice(0, 8);
          node.pairingIssuedAt = new Date();
          node.pairingVerifiedAt = null;
          node.status = 'unpaired';
          await node.save();
          tokens.push({ nodeId: String(node._id), pairingToken });
        }
        blastRadius.affectedNodes = nodes.length;
        blastRadius.affectedTokens = tokens.length;
        results = { tokens };
        break;
      }
      case 'pause_updates': {
        const update = await AgentUpdateJob.updateMany(
          { status: 'running' },
          { status: 'paused', pausedAt: new Date() }
        );
        blastRadius.affectedJobs =
          (update as unknown as { modifiedCount?: number }).modifiedCount ?? 0;
        break;
      }
      case 'fleet_maintenance': {
        const update = await Node.updateMany({}, { 'maintenance.enabled': true });
        blastRadius.affectedNodes =
          (update as unknown as { modifiedCount?: number }).modifiedCount ?? 0;
        break;
      }
      case 'stop_frps': {
        await FrpServerState.updateOne(
          { key: 'global' },
          { enabled: false, runtimeState: 'stopping' }
        );
        break;
      }
    }

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: `emergency.${action}`,
      actorUserId: session.user.username,
      service: 'servermon',
      nodeId: targetId,
      message: `Emergency action: ${action}`,
      metadata: {
        reason,
        actorUserId: session.user.username,
        blastRadius,
        targetId,
      },
    });

    const response: Record<string, unknown> = {
      action,
      blastRadius,
      completed: true,
    };
    if (results !== undefined) {
      Object.assign(response, results);
    }

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to execute emergency action', error);
    return NextResponse.json({ error: 'Failed to execute emergency action' }, { status: 500 });
  }
}
