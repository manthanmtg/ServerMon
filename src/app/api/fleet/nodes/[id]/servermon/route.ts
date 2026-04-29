import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import Node from '@/models/Node';
import PublicRoute from '@/models/PublicRoute';
import FrpServerState from '@/models/FrpServerState';
import { getSession } from '@/lib/session';
import { enforceRbac } from '@/lib/fleet/rbac';
import { buildDefaultServerMonRouteIntent } from '@/lib/fleet/servermonInstall';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:nodes:servermon');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

async function findServerMonRoute(input: {
  nodeId: string;
  slug: string;
  domain: string;
  port: number;
}) {
  const exactRoute = await PublicRoute.findOne({
    nodeId: input.nodeId,
    proxyRuleName: 'servermon',
  }).lean();
  if (exactRoute) return exactRoute;

  return PublicRoute.findOne({
    nodeId: input.nodeId,
    $or: [
      { proxyRuleName: input.slug },
      { slug: input.slug },
      { domain: input.domain },
      {
        'target.localPort': input.port,
        'target.protocol': { $in: ['http', 'https'] },
      },
    ],
  }).lean();
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getSession()) as SessionUser | null;
    const rbacResp = enforceRbac(session?.user, 'can_view_fleet');
    if (rbacResp) return rbacResp;

    await connectDB();
    const { id } = await params;
    const [node, frpServer] = await Promise.all([
      Node.findById(id).lean(),
      FrpServerState.findOne({ key: 'global' }).lean(),
    ]);
    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    const port = node.servermon?.port ?? 8912;
    const defaultRouteIntent = buildDefaultServerMonRouteIntent({
      nodeId: id,
      nodeName: node.name,
      nodeSlug: node.slug,
      port,
      subdomainHost: frpServer?.subdomainHost,
    });
    const route = await findServerMonRoute({
      nodeId: id,
      slug: defaultRouteIntent.slug,
      domain: defaultRouteIntent.domain,
      port,
    });

    return NextResponse.json({
      servermon: node.servermon ?? {
        installed: false,
        serviceName: 'servermon.service',
        serviceState: 'missing',
        serviceEnabled: 'unknown',
        port,
        healthUrl: `http://127.0.0.1:${port}/api/health`,
        healthStatus: 'unknown',
        lastCheckedAt: null,
      },
      node: {
        _id: String(node._id),
        name: node.name,
        slug: node.slug,
        status: node.status,
        tunnelStatus: node.tunnelStatus,
      },
      canInstall: node.tunnelStatus === 'connected' && node.servermon?.installed !== true,
      route,
      defaultRouteIntent,
    });
  } catch (error) {
    log.error('Failed to fetch node ServerMon status', error);
    return NextResponse.json({ error: 'Failed to fetch ServerMon status' }, { status: 500 });
  }
}
