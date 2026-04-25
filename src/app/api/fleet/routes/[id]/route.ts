import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import type { Model } from 'mongoose';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import PublicRoute, { PublicRouteZodSchema } from '@/models/PublicRoute';
import Node from '@/models/Node';
import ConfigRevision from '@/models/ConfigRevision';
import FleetLogEvent from '@/models/FleetLogEvent';
import FrpServerState from '@/models/FrpServerState';
import { normalizeNginxHeaders, renderServerBlock } from '@/lib/fleet/nginx';
import { renderFrpcToml } from '@/lib/fleet/toml';
import { saveRevision } from '@/lib/fleet/revisions';
import { recordAudit } from '@/lib/fleet/audit';
import { resolveDomain } from '@/lib/fleet/dns';
import { getSession } from '@/lib/session';
import { enforceRbac } from '@/lib/fleet/rbac';
import { fleetEventBus } from '@/lib/fleet/eventBus';
import { getOrCreateHubAuthToken } from '@/lib/fleet/hubAuth';
import {
  type PublicRouteProxyRule,
  upsertPublicRouteProxyRule,
} from '@/lib/fleet/publicRouteProxy';
import {
  ensureLetsEncryptCertificate,
  probePublicRoute,
  shouldUseLetsEncrypt,
} from '@/lib/fleet/publicRouteLifecycle';
import { normalizeHostname, validatePublicRouteDomain } from '@/lib/fleet/domain';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:routes:detail');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

const PatchZ = PublicRouteZodSchema.omit({
  status: true,
  dnsStatus: true,
  tlsStatus: true,
  healthStatus: true,
}).partial();

function resolveServerAddr(publicUrl: string | undefined, fallback: string | undefined): string {
  if (!publicUrl) return fallback ?? 'localhost';
  try {
    return new URL(publicUrl).hostname;
  } catch {
    return publicUrl;
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getSession()) as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const route = await PublicRoute.findById(id).lean();
    if (!route) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    return NextResponse.json({ route });
  } catch (error) {
    log.error('Failed to fetch route', error);
    return NextResponse.json({ error: 'Failed to fetch route' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getSession()) as SessionUser | null;
    const rbacResp = enforceRbac(session?.user, 'can_mutate_routes');
    if (rbacResp) return rbacResp;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const existing = await PublicRoute.findById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    const previousStatus = existing.status;

    const body = await req.json();
    const updates = PatchZ.parse(body);

    const frpServer = await FrpServerState.findOne({ key: 'global' }).lean();
    if (updates.domain !== undefined) {
      const domainError = validatePublicRouteDomain(updates.domain, {
        hubDomain: process.env.DOMAIN,
        subdomainHost: frpServer?.subdomainHost,
      });
      if (domainError) {
        return NextResponse.json({ error: domainError }, { status: 400 });
      }
      updates.domain = normalizeHostname(updates.domain);
    }

    const updated = await PublicRoute.findByIdAndUpdate(
      id,
      { ...updates, updatedBy: session.user.username },
      { new: true }
    );
    if (!updated) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    const frpsVhostPort = frpServer?.vhostHttpPort ?? 8080;
    let frpcRevisionId: string | null = null;

    if (updated.enabled !== false) {
      const node = await Node.findById(updated.nodeId);
      if (node) {
        const proxyRules = node.proxyRules as PublicRouteProxyRule[];
        const proxyChanged = upsertPublicRouteProxyRule(
          proxyRules,
          {
            slug: updated.slug,
            domain: updated.domain,
            proxyRuleName: updated.proxyRuleName,
            target: updated.target,
            enabled: updated.enabled,
          },
          frpServer?.subdomainHost
        );
        if (proxyChanged) {
          await node.save();

          const authToken = await getOrCreateHubAuthToken();
          const serverAddr = resolveServerAddr(
            process.env.FLEET_HUB_PUBLIC_URL,
            frpServer?.subdomainHost
          );
          const frpcRendered = renderFrpcToml({
            serverAddr,
            serverPort: frpServer?.bindPort ?? 7000,
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
        }
      }
    }

    const rendered = renderServerBlock(
      {
        domain: updated.domain,
        path: updated.path,
        tlsEnabled: updated.tlsEnabled,
        http2Enabled: updated.http2Enabled,
        websocketEnabled: updated.websocketEnabled,
        maxBodyMb: updated.maxBodyMb,
        timeoutSeconds: updated.timeoutSeconds,
        compression: updated.compression,
        accessMode: updated.accessMode,
        headers: normalizeNginxHeaders(updated.headers),
        slug: updated.slug,
      },
      { frpsVhostPort }
    );

    const revision = await saveRevision(ConfigRevision as unknown as Model<unknown>, {
      kind: 'nginx',
      targetId: id,
      structured: updated.toObject(),
      rendered,
      createdBy: session.user.username,
    });

    updated.nginxConfigRevisionId = revision.id;
    if (frpcRevisionId) updated.frpConfigRevisionId = frpcRevisionId;

    // Re-check DNS after snippet is persisted so the stored status reflects the
    // (potentially new) domain on the updated doc.
    try {
      const { ips } = await resolveDomain(updated.domain);
      updated.dnsStatus = ips.length > 0 ? 'ok' : 'missing';
    } catch {
      updated.dnsStatus = 'missing';
    }

    await updated.save();

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'route.update',
      actorUserId: session.user.username,
      routeId: id,
      service: 'nginx',
    });

    if (process.env.FLEET_AUTO_APPLY_REVISIONS === 'true') {
      const { getFrpOrchestrator, getNginxOrchestrator } =
        await import('@/lib/fleet/orchestrators');
      const { applyRevision } = await import('@/lib/fleet/applyEngine');
      const frp = getFrpOrchestrator();
      const nginx = getNginxOrchestrator();
      const deps = {
        frp,
        nginx,
        ConfigRevision: ConfigRevision as unknown as Parameters<
          typeof applyRevision
        >[1]['ConfigRevision'],
        FrpServerState: FrpServerState as unknown as Parameters<
          typeof applyRevision
        >[1]['FrpServerState'],
        PublicRoute: PublicRoute as unknown as Parameters<typeof applyRevision>[1]['PublicRoute'],
        Node: Node as unknown as Parameters<typeof applyRevision>[1]['Node'],
      };

      if (frpcRevisionId) {
        await applyRevision(frpcRevisionId, deps).catch((err) =>
          log.warn('frpc applyRevision failed post-save', err)
        );
      }

      let canApplyNginx = true;
      if (shouldUseLetsEncrypt(updated)) {
        const bootstrap = renderServerBlock(
          {
            domain: updated.domain,
            path: updated.path,
            tlsEnabled: false,
            http2Enabled: updated.http2Enabled,
            websocketEnabled: updated.websocketEnabled,
            maxBodyMb: updated.maxBodyMb,
            timeoutSeconds: updated.timeoutSeconds,
            compression: updated.compression,
            accessMode: updated.accessMode,
            headers: normalizeNginxHeaders(updated.headers),
            slug: updated.slug,
          },
          { frpsVhostPort }
        );
        const cert = await ensureLetsEncryptCertificate(updated, {
          nginx,
          bootstrapSnippet: bootstrap,
          email: process.env.FLEET_ACME_EMAIL,
        });
        updated.tlsStatus = cert.tlsStatus;
        if (!cert.ok) {
          canApplyNginx = false;
          updated.status = 'cert_failed';
          updated.healthStatus = 'down';
          updated.lastError = cert.error;
          updated.lastCheckedAt = new Date();
          await updated.save();
        }
      }

      if (canApplyNginx) {
        await applyRevision(revision.id, deps).catch(async (err) => {
          log.warn('nginx applyRevision failed post-save', err);
          updated.status = 'nginx_reload_failed';
          updated.healthStatus = 'down';
          updated.lastError = err instanceof Error ? err.message : String(err);
          updated.lastCheckedAt = new Date();
          await updated.save();
          canApplyNginx = false;
        });
      }

      if (canApplyNginx) {
        const runtime = await probePublicRoute(updated).catch((err) => ({
          status: 'degraded' as const,
          dnsStatus: updated.dnsStatus ?? 'unknown',
          tlsStatus: updated.tlsEnabled ? 'unknown' : ('unknown' as const),
          healthStatus: 'unknown' as const,
          lastCheckedAt: new Date(),
          lastError: err instanceof Error ? err.message : String(err),
        }));
        updated.status = runtime.status;
        updated.dnsStatus = runtime.dnsStatus;
        updated.tlsStatus = runtime.tlsStatus;
        updated.healthStatus = runtime.healthStatus;
        updated.lastCheckedAt = runtime.lastCheckedAt;
        updated.lastError = runtime.lastError;
        await updated.save();
      }
    }

    if (previousStatus !== updated.status) {
      fleetEventBus.emit({
        kind: 'route.status_change',
        routeId: id,
        at: new Date().toISOString(),
        data: { from: previousStatus, to: updated.status },
      });
    }

    return NextResponse.json({ route: updated.toObject() });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to update route', error);
    return NextResponse.json({ error: 'Failed to update route' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getSession()) as SessionUser | null;
    const rbacResp = enforceRbac(session?.user, 'can_mutate_routes');
    if (rbacResp) return rbacResp;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const route = await PublicRoute.findById(id);
    if (!route) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    // Disable the referenced FRP proxy rule (if any) on the parent node.
    if (route.nodeId && route.proxyRuleName) {
      const node = await Node.findById(route.nodeId);
      if (node && Array.isArray(node.proxyRules)) {
        for (const p of node.proxyRules) {
          if (p.name === route.proxyRuleName) {
            p.enabled = false;
            p.status = 'disabled';
          }
        }
        await node.save();
      }
    }

    // Remove nginx config revisions associated with this route.
    await ConfigRevision.deleteMany({ kind: 'nginx', targetId: id });

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'route.delete',
      actorUserId: session.user.username,
      routeId: id,
      service: 'nginx',
    });

    await PublicRoute.findByIdAndDelete(id);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    log.error('Failed to delete route', error);
    return NextResponse.json({ error: 'Failed to delete route' }, { status: 500 });
  }
}
