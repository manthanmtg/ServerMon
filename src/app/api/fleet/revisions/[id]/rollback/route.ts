import { NextRequest, NextResponse } from 'next/server';
import type { Model } from 'mongoose';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import ConfigRevision from '@/models/ConfigRevision';
import FleetLogEvent from '@/models/FleetLogEvent';
import FrpServerState from '@/models/FrpServerState';
import Node from '@/models/Node';
import PublicRoute from '@/models/PublicRoute';
import { renderFrpsToml, renderFrpcToml, hashToml } from '@/lib/fleet/toml';
import { renderServerBlock } from '@/lib/fleet/nginx';
import { saveRevision } from '@/lib/fleet/revisions';
import { recordAudit } from '@/lib/fleet/audit';
import { getSession } from '@/lib/session';
import { enforceRbac } from '@/lib/fleet/rbac';
import { getFrpOrchestrator, getNginxOrchestrator } from '@/lib/fleet/orchestrators';
import { applyRevision } from '@/lib/fleet/applyEngine';
import { fleetEventBus, type FleetEventKind } from '@/lib/fleet/eventBus';
import { getOrCreateHubAuthToken } from '@/lib/fleet/hubAuth';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:revisions:rollback');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

interface FrpsStructured {
  bindPort?: number;
  vhostHttpPort?: number;
  vhostHttpsPort?: number;
  subdomainHost?: string;
}

interface FrpcStructured {
  slug?: string;
  frpcConfig?: unknown;
  proxyRules?: unknown[];
}

interface NginxStructured {
  name?: string;
  slug?: string;
  domain?: string;
  path?: string;
  nodeId?: string;
  proxyRuleName?: string;
  target?: { localIp: string; localPort: number; protocol: string };
  tlsEnabled?: boolean;
  http2Enabled?: boolean;
  websocketEnabled?: boolean;
  maxBodyMb?: number;
  timeoutSeconds?: number;
  compression?: boolean;
  accessMode?: string;
  headers?: Record<string, string>;
}

function toHeadersRecord(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
    out[k] = String(v);
  }
  return out;
}

async function applyRollbackRevision(rollbackRevisionId: string): Promise<void> {
  await applyRevision(rollbackRevisionId, {
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
  }).catch((err) => log.warn('applyRevision failed post-rollback', err));
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getSession()) as SessionUser | null;
    const rbacResp = enforceRbac(session?.user, 'can_rollback_revision');
    if (rbacResp) return rbacResp;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const revision = await ConfigRevision.findById(id);
    if (!revision) {
      return NextResponse.json({ error: 'Revision not found' }, { status: 404 });
    }

    let rendered = '';

    if (revision.kind === 'frps') {
      const structured = (revision.structured ?? {}) as FrpsStructured;
      const state = await FrpServerState.findOne({ key: 'global' });
      if (!state) {
        return NextResponse.json({ error: 'FRP server state not found' }, { status: 404 });
      }

      if (typeof structured.bindPort === 'number') {
        state.bindPort = structured.bindPort;
      }
      if (typeof structured.vhostHttpPort === 'number') {
        state.vhostHttpPort = structured.vhostHttpPort;
      }
      if (typeof structured.vhostHttpsPort === 'number') {
        state.vhostHttpsPort = structured.vhostHttpsPort;
      }
      if (typeof structured.subdomainHost === 'string') {
        state.subdomainHost = structured.subdomainHost;
      }
      await state.save();

      const authToken = await getOrCreateHubAuthToken();
      rendered = renderFrpsToml({
        bindPort: state.bindPort,
        vhostHttpPort: state.vhostHttpPort,
        vhostHttpsPort: state.vhostHttpsPort,
        authToken,
        subdomainHost: state.subdomainHost ?? '',
      });

      const rollbackRevision = await saveRevision(ConfigRevision as unknown as Model<unknown>, {
        kind: 'frps',
        targetId: null,
        structured: state.toObject(),
        rendered,
        createdBy: session.user.username,
      });

      state.generatedConfigHash = hashToml(rendered);
      state.configVersion = rollbackRevision.version;
      await state.save();

      revision.rolledBackAt = new Date();
      await revision.save();

      await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
        action: 'revision.rollback',
        actorUserId: session.user.username,
        metadata: {
          revisionId: id,
          rollbackRevisionId: rollbackRevision.id,
          kind: 'frps',
        },
      });

      await applyRollbackRevision(rollbackRevision.id);

      fleetEventBus.emit({
        kind: 'revision.applied' satisfies FleetEventKind,
        at: new Date().toISOString(),
        data: {
          revisionId: rollbackRevision.id,
          kind: 'frps',
          rolledBackFrom: id,
        },
      });

      return NextResponse.json({
        rollbackRevision: {
          ...rollbackRevision,
          rollbackOf: String(revision._id),
        },
      });
    }

    if (revision.kind === 'frpc') {
      const targetId = revision.targetId;
      if (!targetId) {
        return NextResponse.json({ error: 'Revision has no targetId' }, { status: 400 });
      }

      const structured = (revision.structured ?? {}) as FrpcStructured;
      const node = await Node.findById(targetId);
      if (!node) {
        return NextResponse.json({ error: 'Node not found' }, { status: 404 });
      }

      if (typeof structured.slug === 'string') node.slug = structured.slug;
      if (structured.frpcConfig) {
        node.frpcConfig = structured.frpcConfig as typeof node.frpcConfig;
      }
      if (Array.isArray(structured.proxyRules)) {
        node.proxyRules = structured.proxyRules as typeof node.proxyRules;
      }
      await node.save();

      const frpServer = await FrpServerState.findOne({ key: 'global' }).lean();
      const authToken = await getOrCreateHubAuthToken();
      const serverAddr =
        process.env.FLEET_HUB_PUBLIC_URL ?? frpServer?.subdomainHost ?? 'localhost';
      const serverPort = frpServer?.bindPort ?? 7000;

      rendered = renderFrpcToml({
        serverAddr,
        serverPort,
        authToken,
        node: {
          slug: node.slug,
          frpcConfig: node.frpcConfig,
          proxyRules: node.proxyRules,
        },
      });

      const rollbackRevision = await saveRevision(ConfigRevision as unknown as Model<unknown>, {
        kind: 'frpc',
        targetId,
        structured: node.toObject(),
        rendered,
        createdBy: session.user.username,
      });

      node.generatedToml = {
        hash: hashToml(rendered),
        renderedAt: new Date(),
        version: rollbackRevision.version,
      };
      await node.save();

      revision.rolledBackAt = new Date();
      await revision.save();

      await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
        action: 'revision.rollback',
        actorUserId: session.user.username,
        nodeId: targetId,
        metadata: {
          revisionId: id,
          rollbackRevisionId: rollbackRevision.id,
          kind: 'frpc',
        },
      });

      await applyRollbackRevision(rollbackRevision.id);

      fleetEventBus.emit({
        kind: 'revision.applied' satisfies FleetEventKind,
        nodeId: targetId,
        at: new Date().toISOString(),
        data: {
          revisionId: rollbackRevision.id,
          kind: 'frpc',
          rolledBackFrom: id,
        },
      });

      return NextResponse.json({
        rollbackRevision: {
          ...rollbackRevision,
          rollbackOf: String(revision._id),
        },
      });
    }

    if (revision.kind === 'nginx') {
      const targetId = revision.targetId;
      if (!targetId) {
        return NextResponse.json({ error: 'Revision has no targetId' }, { status: 400 });
      }

      const structured = (revision.structured ?? {}) as NginxStructured;
      const route = await PublicRoute.findById(targetId);
      if (!route) {
        return NextResponse.json({ error: 'Route not found' }, { status: 404 });
      }

      if (typeof structured.name === 'string') route.name = structured.name;
      if (typeof structured.domain === 'string') route.domain = structured.domain;
      if (typeof structured.path === 'string') route.path = structured.path;
      if (typeof structured.tlsEnabled === 'boolean') {
        route.tlsEnabled = structured.tlsEnabled;
      }
      if (typeof structured.http2Enabled === 'boolean') {
        route.http2Enabled = structured.http2Enabled;
      }
      if (typeof structured.websocketEnabled === 'boolean') {
        route.websocketEnabled = structured.websocketEnabled;
      }
      if (typeof structured.maxBodyMb === 'number') {
        route.maxBodyMb = structured.maxBodyMb;
      }
      if (typeof structured.timeoutSeconds === 'number') {
        route.timeoutSeconds = structured.timeoutSeconds;
      }
      if (typeof structured.compression === 'boolean') {
        route.compression = structured.compression;
      }
      if (typeof structured.accessMode === 'string') {
        route.accessMode = structured.accessMode as typeof route.accessMode;
      }
      if (structured.headers) {
        route.headers = structured.headers;
      }
      if (structured.target) {
        route.target = structured.target as typeof route.target;
      }
      await route.save();

      const frpServer = await FrpServerState.findOne({ key: 'global' }).lean();
      const frpsVhostPort = frpServer?.vhostHttpPort ?? 8080;

      rendered = renderServerBlock(
        {
          domain: route.domain,
          path: route.path,
          tlsEnabled: route.tlsEnabled,
          http2Enabled: route.http2Enabled,
          websocketEnabled: route.websocketEnabled,
          maxBodyMb: route.maxBodyMb,
          timeoutSeconds: route.timeoutSeconds,
          compression: route.compression,
          accessMode: route.accessMode,
          headers: toHeadersRecord(route.headers),
          slug: route.slug,
        },
        { frpsVhostPort }
      );

      const rollbackRevision = await saveRevision(ConfigRevision as unknown as Model<unknown>, {
        kind: 'nginx',
        targetId,
        structured: route.toObject(),
        rendered,
        createdBy: session.user.username,
      });

      route.nginxConfigRevisionId = rollbackRevision.id;
      await route.save();

      revision.rolledBackAt = new Date();
      await revision.save();

      await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
        action: 'revision.rollback',
        actorUserId: session.user.username,
        routeId: targetId,
        service: 'nginx',
        metadata: {
          revisionId: id,
          rollbackRevisionId: rollbackRevision.id,
          kind: 'nginx',
        },
      });

      await applyRollbackRevision(rollbackRevision.id);

      fleetEventBus.emit({
        kind: 'revision.applied' satisfies FleetEventKind,
        routeId: targetId,
        at: new Date().toISOString(),
        data: {
          revisionId: rollbackRevision.id,
          kind: 'nginx',
          rolledBackFrom: id,
        },
      });

      return NextResponse.json({
        rollbackRevision: {
          ...rollbackRevision,
          rollbackOf: String(revision._id),
        },
      });
    }

    return NextResponse.json(
      { error: `Unknown revision kind: ${String(revision.kind)}` },
      { status: 400 }
    );
  } catch (error) {
    log.error('Failed to rollback revision', error);
    return NextResponse.json({ error: 'Failed to rollback revision' }, { status: 500 });
  }
}
