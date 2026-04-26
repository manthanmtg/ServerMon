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
import { generatePairingToken, hashPairingToken } from '@/lib/fleet/pairing';
import { renderFrpcToml, hashToml } from '@/lib/fleet/toml';
import { saveRevision } from '@/lib/fleet/revisions';
import { recordAudit } from '@/lib/fleet/audit';
import { enforceResourceGuard } from '@/lib/fleet/resourceGuardMiddleware';
import { getSession } from '@/lib/session';
import { enforceRbac } from '@/lib/fleet/rbac';
import { getOrCreateHubAuthToken } from '@/lib/fleet/hubAuth';
import { deriveNodeStatus } from '@/lib/fleet/status';
import type { Model } from 'mongoose';
import type { INodeDTO } from '@/models/Node';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:nodes');

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
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const tag = searchParams.get('tag');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const filter: Record<string, unknown> = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } },
      ];
    }
    if (status) filter.status = status;
    if (tag) filter.tags = tag;

    const [nodes, total] = await Promise.all([
      Node.find(filter).sort({ updatedAt: -1 }).skip(offset).limit(limit).lean(),
      Node.countDocuments(filter),
    ]);

    const now = new Date();
    const nodesWithComputedStatus = nodes.map((node) => ({
      ...node,
      computedStatus: deriveNodeStatus({
        lastSeen: node.lastSeen ? new Date(node.lastSeen) : undefined,
        tunnelStatus: node.tunnelStatus,
        maintenanceEnabled: node.maintenance?.enabled === true,
        disabled: node.status === 'disabled',
        unpaired: !node.pairingVerifiedAt && node.status === 'unpaired',
        lastError: node.lastError ? { occurredAt: node.lastError.occurredAt } : null,
        now,
      }),
    }));

    return NextResponse.json({ nodes: nodesWithComputedStatus, total, limit, offset });
  } catch (error) {
    log.error('Failed to list nodes', error);
    return NextResponse.json({ error: 'Failed to list nodes' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = (await getSession()) as SessionUser | null;
    const rbacResp = enforceRbac(session?.user, 'can_mutate_node_config');
    if (rbacResp) return rbacResp;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const body = await req.json();
    const parsed = NodeZodSchema.parse(body);

    const existing = await Node.findOne({ slug: parsed.slug });
    if (existing) {
      return NextResponse.json(
        { error: `Slug "${parsed.slug}" is already taken` },
        { status: 400 }
      );
    }

    const guard = await enforceResourceGuard({
      key: 'maxAgents',
      scope: 'global',
      currentCounter: async () => Node.countDocuments(),
      ResourcePolicy: ResourcePolicy as unknown as Parameters<
        typeof enforceResourceGuard
      >[0]['ResourcePolicy'],
      FleetLogEvent: FleetLogEvent as unknown as Parameters<
        typeof enforceResourceGuard
      >[0]['FleetLogEvent'],
      actorUserId: session.user.username,
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

    const pairingToken = generatePairingToken();
    const pairingTokenHash = await hashPairingToken(pairingToken);

    const frpServer = await FrpServerState.findOne({ key: 'global' }).lean();
    const authToken = await getOrCreateHubAuthToken();

    // Safety: ensure only hostname is used for serverAddr
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

    const node = await Node.create({
      ...parsed,
      pairingTokenHash,
      pairingTokenPrefix: pairingToken.substring(0, 8),
      pairingIssuedAt: new Date(),
      status: 'unpaired',
      tunnelStatus: 'disconnected',
      createdBy: session.user.username,
    });

    const rendered = renderFrpcToml({
      serverAddr,
      serverPort,
      authToken,
      node: {
        slug: node.slug,
        frpcConfig: node.frpcConfig as INodeDTO['frpcConfig'],
        proxyRules: node.proxyRules as INodeDTO['proxyRules'],
        capabilities: node.capabilities as INodeDTO['capabilities'],
      },
    });

    const revision = await saveRevision(ConfigRevision as unknown as Model<unknown>, {
      kind: 'frpc',
      targetId: String(node._id),
      structured: node.toObject(),
      rendered,
      createdBy: session.user.username,
    });

    node.generatedToml = {
      hash: hashToml(rendered),
      renderedAt: new Date(),
      version: revision.version,
    };

    await node.save();

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'node.create',
      actorUserId: session.user.username,
      nodeId: String(node._id),
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
      }).catch((err) => log.warn('applyRevision failed post-create', err));
    }

    return NextResponse.json({ node: node.toObject(), pairingToken }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to create node', error);
    return NextResponse.json({ error: 'Failed to create node' }, { status: 500 });
  }
}
