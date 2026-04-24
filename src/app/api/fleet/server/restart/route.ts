import { NextResponse } from 'next/server';
import type { Model } from 'mongoose';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import FrpServerState from '@/models/FrpServerState';
import FleetLogEvent from '@/models/FleetLogEvent';
import { recordAudit } from '@/lib/fleet/audit';
import { getSession } from '@/lib/session';
import { enforceRbac } from '@/lib/fleet/rbac';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:server:restart');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

const DEFAULTS = {
  key: 'global',
  enabled: false,
  runtimeState: 'stopped' as const,
  bindPort: 7000,
  vhostHttpPort: 8080,
  configVersion: 0,
  activeConnections: 0,
  connectedNodeIds: [] as string[],
};

export async function POST() {
  try {
    const session = (await getSession()) as SessionUser | null;
    const rbacResp = enforceRbac(session?.user, 'can_toggle_server');
    if (rbacResp) return rbacResp;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    let state = await FrpServerState.findOne({ key: 'global' });
    if (!state) {
      state = await FrpServerState.create(DEFAULTS);
    }

    state.runtimeState = 'starting';
    state.lastRestartAt = new Date();
    await state.save();

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'frps.restart',
      actorUserId: session.user.username,
      service: 'frps',
    });

    return NextResponse.json({ state: state.toObject() });
  } catch (error) {
    log.error('Failed to restart FRP server', error);
    return NextResponse.json({ error: 'Failed to restart FRP server' }, { status: 500 });
  }
}
