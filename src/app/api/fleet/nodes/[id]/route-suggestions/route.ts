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
const MONGO_OBJECT_ID_RE = /^[a-f\d]{24}$/i;

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

function objectIdToString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'toString' in value) {
    return String((value as { toString: () => string }).toString());
  }
  return String(value);
}

async function findNodeByIdOrSlug(idOrSlug: string) {
  if (MONGO_OBJECT_ID_RE.test(idOrSlug)) {
    const node = await Node.findById(idOrSlug).lean();
    if (node) return node;
  }
  return Node.findOne({ slug: idOrSlug }).lean();
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getSession()) as SessionUser | null;
    const rbacResp = enforceRbac(session?.user, 'can_view_fleet');
    if (rbacResp) return rbacResp;

    await connectDB();
    const { id } = await params;
    const node = await findNodeByIdOrSlug(id);

    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    const nodeId = objectIdToString(node._id);
    const [existingRoutes, frpServer] = await Promise.all([
      PublicRoute.find({ nodeId }).lean(),
      FrpServerState.findOne({ key: 'global' }).lean(),
    ]);

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
