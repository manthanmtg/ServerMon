import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import Node from '@/models/Node';
import PublicRoute from '@/models/PublicRoute';
import FrpServerState from '@/models/FrpServerState';
import { getSession } from '@/lib/session';
import { enforceRbac } from '@/lib/fleet/rbac';
import { buildFleetRouteSuggestions } from '@/lib/fleet/routeSuggestions';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:nodes:route-suggestions');

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
    const [node, existingRoutes, frpServer] = await Promise.all([
      Node.findById(id).lean(),
      PublicRoute.find({ nodeId: id }).lean(),
      FrpServerState.findOne({ key: 'global' }).lean(),
    ]);

    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    const suggestions = buildFleetRouteSuggestions({
      node,
      existingRoutes,
      subdomainHost: frpServer?.subdomainHost,
    });

    return NextResponse.json({ suggestions });
  } catch (error) {
    log.error('Failed to build route suggestions', error);
    return NextResponse.json({ error: 'Failed to build route suggestions' }, { status: 500 });
  }
}
