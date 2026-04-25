import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import type { Model } from 'mongoose';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import PublicRoute, { PublicRouteZodSchema } from '@/models/PublicRoute';
import ConfigRevision from '@/models/ConfigRevision';
import FleetLogEvent from '@/models/FleetLogEvent';
import FrpServerState from '@/models/FrpServerState';
import Node from '@/models/Node';
import ResourcePolicy from '@/models/ResourcePolicy';
import { normalizeNginxHeaders, renderServerBlock } from '@/lib/fleet/nginx';
import { renderFrpcToml } from '@/lib/fleet/toml';
import { saveRevision } from '@/lib/fleet/revisions';
import { recordAudit } from '@/lib/fleet/audit';
import { resolveDomain } from '@/lib/fleet/dns';
import { getSession } from '@/lib/session';
import { enforceRbac } from '@/lib/fleet/rbac';
import { enforceResourceGuard } from '@/lib/fleet/resourceGuardMiddleware';
import { getOrCreateHubAuthToken } from '@/lib/fleet/hubAuth';
import {
  type PublicRouteProxyRule,
  upsertPublicRouteProxyRule,
} from '@/lib/fleet/publicRouteProxy';
import { normalizeHostname, validatePublicRouteDomain } from '@/lib/fleet/domain';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:routes');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

const CreateZ = PublicRouteZodSchema.omit({
  status: true,
  dnsStatus: true,
  tlsStatus: true,
  healthStatus: true,
});

function resolveServerAddr(publicUrl: string | undefined, fallback: string | undefined): string {
  if (!publicUrl) return fallback ?? 'localhost';
  try {
    return new URL(publicUrl).hostname;
  } catch {
    return publicUrl;
  }
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
    const domain = searchParams.get('domain') || '';
    const nodeId = searchParams.get('nodeId') || '';
    const status = searchParams.get('status') || '';
    const limit = Math.min(Number(searchParams.get('limit')) || 100, 200);
    const offset = Number(searchParams.get('offset')) || 0;

    const filter: Record<string, unknown> = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } },
        { domain: { $regex: search, $options: 'i' } },
      ];
    }
    if (domain) filter.domain = domain;
    if (nodeId) filter.nodeId = nodeId;
    if (status) filter.status = status;

    const [routes, total] = await Promise.all([
      PublicRoute.find(filter).sort({ updatedAt: -1 }).skip(offset).limit(limit).lean(),
      PublicRoute.countDocuments(filter),
    ]);

    return NextResponse.json({ routes, total });
  } catch (error) {
    log.error('Failed to fetch routes', error);
    return NextResponse.json({ error: 'Failed to fetch routes' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = (await getSession()) as SessionUser | null;
    const rbacResp = enforceRbac(session?.user, 'can_mutate_routes');
    if (rbacResp) return rbacResp;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const body = await req.json();
    const parsed = CreateZ.parse(body);

    const frpServer = await FrpServerState.findOne({ key: 'global' }).lean();
    const domainError = validatePublicRouteDomain(parsed.domain, {
      hubDomain: process.env.DOMAIN,
      subdomainHost: frpServer?.subdomainHost,
    });
    if (domainError) {
      return NextResponse.json({ error: domainError }, { status: 400 });
    }
    const routeDomain = normalizeHostname(parsed.domain);

    // Uniqueness checks
    const slugExists = await PublicRoute.findOne({ slug: parsed.slug });
    if (slugExists) {
      return NextResponse.json(
        { error: `Slug "${parsed.slug}" is already taken` },
        { status: 409 }
      );
    }

    const domainExists = await PublicRoute.findOne({ domain: routeDomain });
    if (domainExists) {
      return NextResponse.json(
        { error: `Domain "${parsed.domain}" is already configured` },
        { status: 409 }
      );
    }

    const guard = await enforceResourceGuard({
      key: 'maxPublicRoutes',
      scope: 'global',
      currentCounter: () => PublicRoute.countDocuments(),
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

    // Ensure a matching proxy rule exists on the target Node. Auto-insert if
    // absent so the user can expose a service without first provisioning
    // an FRP proxy rule manually.
    const node = await Node.findById(parsed.nodeId);
    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 400 });
    }

    let autoInsertedProxy = false;
    let frpcRevisionId: string | null = null;
    const existingProxyRule = Array.isArray(node.proxyRules)
      ? node.proxyRules.find((p) => p.name === parsed.proxyRuleName)
      : undefined;
    const proxyRules = node.proxyRules as PublicRouteProxyRule[];
    const routeConfig = { ...parsed, domain: routeDomain };
    const proxyChanged = upsertPublicRouteProxyRule(
      proxyRules,
      routeConfig,
      frpServer?.subdomainHost
    );
    if (proxyChanged) {
      await node.save();

      const authToken = await getOrCreateHubAuthToken();
      const serverAddr = resolveServerAddr(
        process.env.FLEET_HUB_PUBLIC_URL,
        frpServer?.subdomainHost
      );
      const serverPort = frpServer?.bindPort ?? 7000;
      const frpcRendered = renderFrpcToml({
        serverAddr,
        serverPort,
        authToken,
        node: {
          slug: node.slug,
          frpcConfig: node.frpcConfig,
          proxyRules: node.proxyRules,
          capabilities: node.capabilities,
        },
      });
      const frpcRevision = await saveRevision(ConfigRevision as unknown as Model<unknown>, {
        kind: 'frpc',
        targetId: String(node._id),
        structured: {
          slug: node.slug,
          frpcConfig: node.frpcConfig,
          proxyRules: node.proxyRules,
        },
        rendered: frpcRendered,
        createdBy: session.user.username,
      });
      frpcRevisionId = frpcRevision.id;
      autoInsertedProxy = !existingProxyRule;
    }

    // DNS resolution
    let dnsStatus: 'ok' | 'missing' = 'missing';
    try {
      const { ips } = await resolveDomain(routeDomain);
      dnsStatus = ips.length > 0 ? 'ok' : 'missing';
    } catch {
      dnsStatus = 'missing';
    }

    const frpsVhostPort = frpServer?.vhostHttpPort ?? 8080;

    const created = await PublicRoute.create({
      ...parsed,
      domain: routeDomain,
      status: 'pending_dns',
      dnsStatus,
      tlsStatus: 'unknown',
      healthStatus: 'unknown',
      createdBy: session.user.username,
    });

    const routeId = String(created._id);

    const rendered = renderServerBlock(
      {
        domain: created.domain,
        path: created.path,
        tlsEnabled: created.tlsEnabled,
        http2Enabled: created.http2Enabled,
        websocketEnabled: created.websocketEnabled,
        maxBodyMb: created.maxBodyMb,
        timeoutSeconds: created.timeoutSeconds,
        compression: created.compression,
        accessMode: created.accessMode,
        headers: normalizeNginxHeaders(created.headers),
        slug: created.slug,
      },
      { frpsVhostPort }
    );

    const revision = await saveRevision(ConfigRevision as unknown as Model<unknown>, {
      kind: 'nginx',
      targetId: routeId,
      structured: created.toObject(),
      rendered,
      createdBy: session.user.username,
    });

    created.nginxConfigRevisionId = revision.id;
    if (frpcRevisionId) created.frpConfigRevisionId = frpcRevisionId;
    await created.save();

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'route.create',
      actorUserId: session.user.username,
      routeId,
      service: 'nginx',
    });

    if (process.env.FLEET_AUTO_APPLY_REVISIONS === 'true') {
      const { getFrpOrchestrator, getNginxOrchestrator } =
        await import('@/lib/fleet/orchestrators');
      const { applyRevision } = await import('@/lib/fleet/applyEngine');
      const deps = {
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
      };
      for (const revisionId of [frpcRevisionId, revision.id].filter(
        (id): id is string => typeof id === 'string'
      )) {
        await applyRevision(revisionId, deps).catch((err) =>
          log.warn('applyRevision failed post-save', err)
        );
      }
    }

    return NextResponse.json({ route: created.toObject(), autoInsertedProxy }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to create route', error);
    return NextResponse.json({ error: 'Failed to create route' }, { status: 500 });
  }
}
