import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import Node, { NodeZodSchema } from '@/models/Node';
import FleetLogEvent from '@/models/FleetLogEvent';
import ConfigRevision from '@/models/ConfigRevision';
import FrpServerState from '@/models/FrpServerState';
import PublicRoute from '@/models/PublicRoute';
import ResourcePolicy from '@/models/ResourcePolicy';
import { renderFrpcToml, hashToml } from '@/lib/fleet/toml';
import { saveRevision } from '@/lib/fleet/revisions';
import { recordAudit } from '@/lib/fleet/audit';
import { deriveNodeStatus } from '@/lib/fleet/status';
import { enforceResourceGuard } from '@/lib/fleet/resourceGuardMiddleware';
import { getSession } from '@/lib/session';
import { enforceRbac } from '@/lib/fleet/rbac';
import { getOrCreateHubAuthToken } from '@/lib/fleet/hubAuth';
import {
  type PublicRouteProxyRule,
  type PublicRouteProxySource,
  upsertPublicRouteProxyRule,
} from '@/lib/fleet/publicRouteProxy';
import type { Model } from 'mongoose';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:nodes:detail');

function extractBearer(req: Request): string | null {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!auth) return null;
  const match = /^Bearer (.+)$/.exec(auth);
  return match ? match[1] : null;
}

const NodePatchZodSchema = NodeZodSchema.pick({
  name: true,
  description: true,
  tags: true,
  frpcConfig: true,
  proxyRules: true,
  capabilities: true,
  autoStartEnabled: true,
  agentVersion: true,
  serviceManager: true,
})
  .extend({
    maintenance: NodeZodSchema.shape.maintenance,
  })
  .partial();

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = (await getSession()) as SessionUser | null;

    await connectDB();
    const node = await Node.findById(id).lean();
    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    // Authenticate: Either browser session OR Bearer token from agent
    if (!session) {
      const token = extractBearer(req);
      if (!token || !node.pairingTokenHash) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const { verifyPairingToken } = await import('@/lib/fleet/pairing');
      const valid = await verifyPairingToken(token, node.pairingTokenHash);
      if (!valid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const now = new Date();
    const computedStatus = deriveNodeStatus({
      lastSeen: node.lastSeen,
      tunnelStatus: node.tunnelStatus,
      maintenanceEnabled: node.maintenance?.enabled === true,
      disabled: node.status === 'disabled',
      unpaired: !node.pairingVerifiedAt && node.status === 'unpaired',
      lastError: node.lastError ? { occurredAt: node.lastError.occurredAt as Date } : null,
      now,
    });

    return NextResponse.json({
      node: { ...node, _id: String(node._id) },
      computedStatus,
    });
  } catch (error) {
    log.error('Failed to fetch node', error);
    return NextResponse.json({ error: 'Failed to fetch node' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = (await getSession()) as SessionUser | null;

    await connectDB();
    const existing = await Node.findById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    // Authenticate: Either browser session (RBAC checked) OR Bearer token from agent
    let actorUsername = 'system';
    if (session) {
      const rbacResp = enforceRbac(session.user, 'can_mutate_node_config');
      if (rbacResp) return rbacResp;
      actorUsername = session.user.username;
    } else {
      const token = extractBearer(req);
      if (!token || !existing.pairingTokenHash) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const { verifyPairingToken } = await import('@/lib/fleet/pairing');
      const valid = await verifyPairingToken(token, existing.pairingTokenHash);
      if (!valid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      actorUsername = `agent:${id}`;
    }

    const body = await req.json();
    const updates = NodePatchZodSchema.parse(body);

    if (Array.isArray(updates.proxyRules)) {
      const prevLen = Array.isArray(existing.proxyRules) ? existing.proxyRules.length : 0;
      const nextLen = updates.proxyRules.length;
      if (nextLen > prevLen) {
        const guard = await enforceResourceGuard({
          key: 'maxProxiesPerNode',
          scope: 'node',
          scopeId: id,
          currentCounter: async () => nextLen,
          ResourcePolicy: ResourcePolicy as unknown as Parameters<
            typeof enforceResourceGuard
          >[0]['ResourcePolicy'],
          FleetLogEvent: FleetLogEvent as unknown as Parameters<
            typeof enforceResourceGuard
          >[0]['FleetLogEvent'],
          actorUserId: actorUsername,
        });
        if (!guard.allowed) {
          return NextResponse.json(
            {
              error: 'Resource limit exceeded',
              limit: guard.limit,
              current: guard.current,
              message: guard.message,
            },
            { status: 429 }
          );
        }
      }
    }

    const frpServer = await FrpServerState.findOne({ key: 'global' }).lean();

    if (Array.isArray(updates.proxyRules)) {
      const routeQuery = PublicRoute.find({
        nodeId: id,
        enabled: true,
        target: { $exists: true },
      }) as unknown as {
        lean: () => Promise<PublicRouteProxySource[]> | PublicRouteProxySource[];
      };
      const publicRoutes = await routeQuery.lean();
      const proxyRules = updates.proxyRules as PublicRouteProxyRule[];
      for (const route of publicRoutes) {
        upsertPublicRouteProxyRule(proxyRules, route, frpServer?.subdomainHost);
      }
    }

    const updated = await Node.findByIdAndUpdate(
      id,
      { ...updates, updatedBy: actorUsername },
      { new: true }
    );
    if (!updated) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    const authToken = await getOrCreateHubAuthToken();
    const publicUrl = process.env.FLEET_HUB_PUBLIC_URL;
    let serverAddr = frpServer?.subdomainHost ?? 'localhost';
    if (publicUrl) {
      try {
        serverAddr = new URL(publicUrl).hostname;
      } catch {
        serverAddr = publicUrl;
      }
    }
    const serverPort = frpServer?.bindPort ?? 7000;

    const rendered = renderFrpcToml({
      serverAddr,
      serverPort,
      authToken,
      node: {
        slug: updated.slug,
        frpcConfig: updated.frpcConfig,
        proxyRules: updated.proxyRules,
        capabilities: updated.capabilities,
      },
    });

    const revision = await saveRevision(ConfigRevision as unknown as Model<unknown>, {
      kind: 'frpc',
      targetId: id,
      structured: updated.toObject(),
      rendered,
      createdBy: actorUsername,
    });

    updated.generatedToml = {
      hash: hashToml(rendered),
      renderedAt: new Date(),
      version: revision.version,
    };
    await updated.save();

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'node.update',
      actorUserId: actorUsername,
      nodeId: id,
    });

    if (process.env.FLEET_AUTO_APPLY_REVISIONS === 'true') {
      const { getFrpOrchestrator, getNginxOrchestrator } =
        await import('@/lib/fleet/orchestrators');
      const { applyRevision } = await import('@/lib/fleet/applyEngine');
      await applyRevision(revision.id, {
        frp: getFrpOrchestrator(),
        nginx: getNginxOrchestrator(),
        ConfigRevision: ConfigRevision as unknown as Parameters<
          typeof applyRevision
        >[1]['ConfigRevision'],
        FrpServerState: FrpServerState as unknown as Parameters<
          typeof applyRevision
        >[1]['FrpServerState'],
        PublicRoute: PublicRoute as unknown as Parameters<typeof applyRevision>[1]['PublicRoute'],
        Node: Node as unknown as Parameters<typeof applyRevision>[1]['Node'],
      }).catch((err) => log.warn('applyRevision failed post-save', err));
    }

    return NextResponse.json({ node: updated.toObject() });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to update node', error);
    return NextResponse.json({ error: 'Failed to update node' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    node.status = 'disabled';
    if (Array.isArray(node.proxyRules)) {
      for (const p of node.proxyRules) {
        p.enabled = false;
        p.status = 'disabled';
      }
    }
    await node.save();

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'node.delete',
      actorUserId: session.user.username,
      nodeId: id,
    });

    await Node.findByIdAndDelete(id);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    log.error('Failed to delete node', error);
    return NextResponse.json({ error: 'Failed to delete node' }, { status: 500 });
  }
}
