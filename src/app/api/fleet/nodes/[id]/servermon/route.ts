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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getSession()) as SessionUser | null;
    const rbacResp = enforceRbac(session?.user, 'can_view_fleet');
    if (rbacResp) return rbacResp;

    await connectDB();
    const { id } = await params;
    const node = await Node.findById(id).lean();
    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    const [route, frpServer] = await Promise.all([
      PublicRoute.findOne({ nodeId: id, proxyRuleName: 'servermon' }).lean(),
      FrpServerState.findOne({ key: 'global' }).lean(),
    ]);
    const port = node.servermon?.port ?? 8912;
    const defaultRouteIntent = buildDefaultServerMonRouteIntent({
      nodeId: id,
      nodeName: node.name,
      nodeSlug: node.slug,
      port,
      subdomainHost: frpServer?.subdomainHost,
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
