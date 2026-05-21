import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import ConfigRevision from '@/models/ConfigRevision';
import FleetLogEvent from '@/models/FleetLogEvent';
import FrpServerState from '@/models/FrpServerState';
import PublicRoute from '@/models/PublicRoute';
import Node from '@/models/Node';
import { applyRevision, type ApplyEngineDeps } from '@/lib/fleet/applyEngine';
import { getFrpOrchestrator, getNginxOrchestrator } from '@/lib/fleet/orchestrators';
import { recordAudit } from '@/lib/fleet/audit';
import { getSession } from '@/lib/session';
import { enforceRbac } from '@/lib/fleet/rbac';
import { fleetEventBus } from '@/lib/fleet/eventBus';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:revisions:apply');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getSession()) as SessionUser | null;
    const rbacResp = enforceRbac(session?.user, 'can_apply_revision');
    if (rbacResp) return rbacResp;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const frp = getFrpOrchestrator();
    const nginx = getNginxOrchestrator();

    try {
      const engineDeps: ApplyEngineDeps = {
        frp,
        nginx,
        ConfigRevision: {
          findById: (id: string) => ConfigRevision.findById(id).exec()
        },
        FrpServerState: {
          findOneAndUpdate: (filter, update, opts) => FrpServerState.findOneAndUpdate(filter, update, opts).exec()
        },
        PublicRoute: {
          findByIdAndUpdate: (id, update, opts) => PublicRoute.findByIdAndUpdate(id, update, opts).exec()
        },
        Node: {
          findByIdAndUpdate: (id, update, opts) => Node.findByIdAndUpdate(id, update, opts).exec()
        },
      };
      const result = await applyRevision(id, engineDeps);

      await recordAudit(FleetLogEvent, {
        action: 'revision.apply',
        actorUserId: session.user.username,
        metadata: {
          revisionId: id,
          kind: result.kind,
          reloaded: result.reloaded,
          detail: result.detail,
        },
      });

      fleetEventBus.emit({
        kind: 'revision.applied',
        at: new Date().toISOString(),
        data: {
          revisionId: id,
          kind: result.kind,
          reloaded: result.reloaded,
        },
      });

      return NextResponse.json({ result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'revision not found') {
        return NextResponse.json({ error: 'Revision not found' }, { status: 404 });
      }
      log.error('Failed to apply revision', err);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  } catch (error) {
    log.error('Failed to apply revision', error);
    return NextResponse.json({ error: 'Failed to apply revision' }, { status: 500 });
  }
}
