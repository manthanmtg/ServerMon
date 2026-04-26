import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Node from '@/models/Node';
import { getSession } from '@/lib/session';
import { deriveNodeStatus } from '@/lib/fleet/status';

export const dynamic = 'force-dynamic';

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

/**
 * Utility endpoint to find a node ID by its slug.
 * This is safer than using the general search endpoint which might return multiple matches.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const session = (await getSession()) as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { slug } = await params;

    const node = await Node.findOne({ slug }).lean();
    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    const now = new Date();
    const computedStatus = deriveNodeStatus({
      lastSeen: node.lastSeen,
      tunnelStatus: node.tunnelStatus,
      maintenanceEnabled: node.maintenance?.enabled === true,
      disabled: node.status === 'disabled',
      unpaired: !node.pairingVerifiedAt && node.status === 'unpaired',
      lastError: node.lastError ? { occurredAt: node.lastError.occurredAt } : null,
      now,
    });

    return NextResponse.json({
      _id: node._id,
      name: node.name,
      slug: node.slug,
      status: computedStatus,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch node' }, { status: 500 });
  }
}
