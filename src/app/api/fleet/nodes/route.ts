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
import { deriveNodeStatus } from '@/lib/fleet/status';
import { enforceResourceGuard } from '@/lib/fleet/resourceGuardMiddleware';
import { getSession } from '@/lib/session';
import type { Model } from 'mongoose';

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
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const tag = searchParams.get('tag') || '';
    const limit = Math.min(Number(searchParams.get('limit')) || 100, 200);
    const offset = Number(searchParams.get('offset')) || 0;

    const filter: Record<string, unknown> = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }
    if (status) filter.status = status;
    if (tag) filter.tags = tag;

    const [nodes, total] = await Promise.all([
      Node.find(filter).sort({ updatedAt: -1 }).skip(offset).limit(limit).lean(),
      Node.countDocuments(filter),
    ]);

    const now = new Date();
    const nodesWithStatus = nodes.map((n) => {
      const computedStatus = deriveNodeStatus({
        lastSeen: n.lastSeen,
        tunnelStatus: n.tunnelStatus,
        maintenanceEnabled: n.maintenance?.enabled === true,
        disabled: n.status === 'disabled',
        unpaired: !n.pairingVerifiedAt && n.status === 'unpaired',
        lastError: n.lastError ? { occurredAt: n.lastError.occurredAt } : null,
        now,
      });
      return { ...n, computedStatus };
    });

    return NextResponse.json({ nodes: nodesWithStatus, total });
  } catch (error) {
    log.error('Failed to fetch nodes', error);
    return NextResponse.json({ error: 'Failed to fetch nodes' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = (await getSession()) as SessionUser | null;
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
      currentCounter: () => Node.countDocuments(),
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
    const pairingTokenPrefix = pairingToken.slice(0, 8);
    const now = new Date();

    const created = await Node.create({
      ...parsed,
      status: 'unpaired',
      pairingTokenHash,
      pairingTokenPrefix,
      pairingIssuedAt: now,
      createdBy: session.user.username,
    });

    const frpServer = await FrpServerState.findOne({ key: 'global' }).lean();
    const authToken = process.env.FLEET_HUB_AUTH_TOKEN ?? 'pending';
    const serverAddr = process.env.FLEET_HUB_PUBLIC_URL ?? frpServer?.subdomainHost ?? 'localhost';
    const serverPort = frpServer?.bindPort ?? 7000;

    const rendered = renderFrpcToml({
      serverAddr,
      serverPort,
      authToken,
      node: {
        slug: parsed.slug,
        frpcConfig: parsed.frpcConfig,
        proxyRules: parsed.proxyRules,
      },
    });

    const nodeId = String(created._id);
    const revision = await saveRevision(ConfigRevision as unknown as Model<unknown>, {
      kind: 'frpc',
      targetId: nodeId,
      structured: created.toObject(),
      rendered,
      createdBy: session.user.username,
    });

    created.generatedToml = {
      hash: hashToml(rendered),
      renderedAt: now,
      version: revision.version,
    };
    await created.save();

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'node.create',
      actorUserId: session.user.username,
      nodeId,
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

    return NextResponse.json(
      {
        node: created.toObject(),
        pairingToken,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to create node', error);
    return NextResponse.json({ error: 'Failed to create node' }, { status: 500 });
  }
}
