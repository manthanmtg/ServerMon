import { NextRequest, NextResponse } from 'next/server';
import { ZodError, z } from 'zod';
import type { Model } from 'mongoose';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import FrpServerState from '@/models/FrpServerState';
import ConfigRevision from '@/models/ConfigRevision';
import FleetLogEvent from '@/models/FleetLogEvent';
import Node from '@/models/Node';
import PublicRoute from '@/models/PublicRoute';
import { renderFrpsToml, hashToml } from '@/lib/fleet/toml';
import { saveRevision } from '@/lib/fleet/revisions';
import { recordAudit } from '@/lib/fleet/audit';
import { getSession } from '@/lib/session';
import { enforceRbac } from '@/lib/fleet/rbac';
import { fleetEventBus } from '@/lib/fleet/eventBus';
import { getOrCreateHubAuthToken } from '@/lib/fleet/hubAuth';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:server');

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

const ToggleZ = z.object({
  enabled: z.boolean(),
  force: z.boolean().optional(),
});

const PatchZ = z.object({
  bindPort: z.number().int().min(1).max(65535).optional(),
  vhostHttpPort: z.number().int().min(1).max(65535).optional(),
  vhostHttpsPort: z.number().int().min(1).max(65535).optional(),
  subdomainHost: z.string().max(253).optional(),
});

async function getOrCreateState() {
  let state = await FrpServerState.findOne({ key: 'global' });
  if (!state) {
    state = await FrpServerState.create(DEFAULTS);
  }
  return state;
}

async function rerenderAndSaveRevision(
  state: Awaited<ReturnType<typeof getOrCreateState>>,
  actor: string
) {
  const authToken = await getOrCreateHubAuthToken();
  const rendered = renderFrpsToml({
    bindPort: state.bindPort,
    vhostHttpPort: state.vhostHttpPort,
    vhostHttpsPort: state.vhostHttpsPort,
    authToken,
    subdomainHost: state.subdomainHost ?? '',
  });
  const revision = await saveRevision(ConfigRevision as unknown as Model<unknown>, {
    kind: 'frps',
    targetId: null,
    structured: state.toObject(),
    rendered,
    createdBy: actor,
  });
  state.generatedConfigHash = hashToml(rendered);
  state.configVersion = revision.version;
  await state.save();

  if (process.env.FLEET_AUTO_APPLY_REVISIONS === 'true') {
    const { getFrpOrchestrator, getNginxOrchestrator } = await import('@/lib/fleet/orchestrators');
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

  return { revision, rendered };
}

export async function GET() {
  try {
    const session = (await getSession()) as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const state = await getOrCreateState();

    // Auto-repair/Sync: If env vars are set but DB is empty, update DB to match Env.
    // This ensures that changes in /etc/servermon/env are reflected in the UI/Wizard.
    let needsSave = false;
    const envSubdomain = process.env.FRP_SUBDOMAIN_HOST;
    if (envSubdomain && !state.subdomainHost) {
      state.subdomainHost = envSubdomain;
      needsSave = true;
    }

    const envBindPort = process.env.FRP_BIND_PORT ? parseInt(process.env.FRP_BIND_PORT, 10) : null;
    if (envBindPort && !isNaN(envBindPort) && state.bindPort !== envBindPort) {
      state.bindPort = envBindPort;
      needsSave = true;
    }

    if (needsSave) {
      log.info('Synchronized database state with environment variables');
      await state.save();
    }

    // Include environment defaults to help the setup wizard prepopulate
    const envDefaults = {
      hubPublicUrl: process.env.FLEET_HUB_PUBLIC_URL || '',
      acmeEmail: process.env.FLEET_ACME_EMAIL || '',
      managedDir: process.env.FLEET_NGINX_MANAGED_DIR || '/etc/nginx/servermon',
      binaryPath: process.env.FLEET_NGINX_BINARY || 'nginx',
    };

    return NextResponse.json({
      state: state.toObject(),
      envDefaults,
    });
  } catch (error) {
    log.error('Failed to fetch FRP server state', error);
    return NextResponse.json({ error: 'Failed to fetch FRP server state' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = (await getSession()) as SessionUser | null;
    const rbacResp = enforceRbac(session?.user, 'can_toggle_server');
    if (rbacResp) return rbacResp;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const body = await req.json();
    const { enabled, force } = ToggleZ.parse(body);

    const state = await getOrCreateState();

    if (enabled === false && !force && (state.activeConnections ?? 0) > 0) {
      return NextResponse.json(
        {
          blocked: true,
          activeConnections: state.activeConnections ?? 0,
        },
        { status: 409 }
      );
    }

    state.enabled = enabled;
    state.runtimeState = enabled ? 'starting' : 'stopping';
    await state.save();

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'frps.toggle',
      actorUserId: session.user.username,
      service: 'frps',
      metadata: { enabled, force: force === true },
    });

    await rerenderAndSaveRevision(state, session.user.username);

    fleetEventBus.emit({
      kind: 'frp.state_change',
      at: new Date().toISOString(),
      data: {
        enabled: state.enabled,
        runtimeState: state.runtimeState,
      },
    });

    return NextResponse.json({ state: state.toObject() });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to toggle FRP server', error);
    return NextResponse.json({ error: 'Failed to toggle FRP server' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = (await getSession()) as SessionUser | null;
    const rbacResp = enforceRbac(session?.user, 'can_toggle_server');
    if (rbacResp) return rbacResp;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const body = await req.json();
    const patch = PatchZ.parse(body);

    const state = await getOrCreateState();

    if (patch.bindPort !== undefined) state.bindPort = patch.bindPort;
    if (patch.vhostHttpPort !== undefined) state.vhostHttpPort = patch.vhostHttpPort;
    if (patch.vhostHttpsPort !== undefined) state.vhostHttpsPort = patch.vhostHttpsPort;
    if (patch.subdomainHost !== undefined) state.subdomainHost = patch.subdomainHost;

    await state.save();

    await rerenderAndSaveRevision(state, session.user.username);

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'frps.update',
      actorUserId: session.user.username,
      service: 'frps',
      metadata: patch,
    });

    return NextResponse.json({ state: state.toObject() });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to update FRP server', error);
    return NextResponse.json({ error: 'Failed to update FRP server' }, { status: 500 });
  }
}
