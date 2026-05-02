import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import type { Model } from 'mongoose';
import { ZodError } from 'zod';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import Node from '@/models/Node';
import PublicRoute from '@/models/PublicRoute';
import FrpServerState from '@/models/FrpServerState';
import FleetLogEvent from '@/models/FleetLogEvent';
import { getSession } from '@/lib/session';
import { enforceRbac } from '@/lib/fleet/rbac';
import { recordAudit } from '@/lib/fleet/audit';
import { storeCommandSecret } from '@/lib/fleet/commandSecrets';
import {
  ServerMonInstallRequestZ,
  buildDefaultServerMonRouteIntent,
  redactInstallArgs,
} from '@/lib/fleet/servermonInstall';
import { normalizeHostname, validatePublicRouteDomain } from '@/lib/fleet/domain';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:nodes:servermon:install');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

function hasPendingInstall(node: { pendingCommands?: Array<{ command?: string }> }): boolean {
  return (node.pendingCommands ?? []).some((command) => command.command === 'install-servermon');
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getSession()) as SessionUser | null;
    const rbacResp = enforceRbac(session?.user, 'can_install_servermon');
    if (rbacResp) return rbacResp;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;
    const parsed = ServerMonInstallRequestZ.parse(await req.json());
    const node = await Node.findById(id);
    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }
    if (node.tunnelStatus !== 'connected') {
      return NextResponse.json(
        { error: 'Agent must be connected before install' },
        { status: 409 }
      );
    }
    if (node.servermon?.installed === true) {
      return NextResponse.json({ error: 'ServerMon is already installed' }, { status: 409 });
    }
    if (hasPendingInstall(node)) {
      return NextResponse.json({ error: 'ServerMon install is already queued' }, { status: 409 });
    }

    const frpServer = await FrpServerState.findOne({ key: 'global' }).lean();
    const routeIntent = buildDefaultServerMonRouteIntent({
      nodeId: id,
      nodeName: node.name,
      nodeSlug: node.slug,
      port: parsed.port,
      subdomainHost: frpServer?.subdomainHost,
    });
    if (parsed.routeDomain) {
      routeIntent.domain = normalizeHostname(parsed.routeDomain);
    }

    if (parsed.createPublicRoute) {
      const domainError = validatePublicRouteDomain(routeIntent.domain, {
        hubDomain: process.env.DOMAIN,
        subdomainHost: frpServer?.subdomainHost,
      });
      if (domainError) {
        return NextResponse.json({ error: domainError }, { status: 400 });
      }
      const [domainExists, slugExists] = await Promise.all([
        PublicRoute.findOne({ domain: routeIntent.domain }),
        PublicRoute.findOne({ slug: routeIntent.slug }),
      ]);
      if (domainExists) {
        return NextResponse.json(
          { error: `Domain "${routeIntent.domain}" is already configured` },
          { status: 409 }
        );
      }
      if (slugExists) {
        return NextResponse.json(
          { error: `Slug "${routeIntent.slug}" is already taken` },
          { status: 409 }
        );
      }
    }

    const commandId = crypto.randomBytes(8).toString('hex');
    await storeCommandSecret({
      commandId,
      nodeId: id,
      payload: { mongoUri: parsed.mongoUri },
    });

    const commandArgs = {
      port: parsed.port,
      skipMongo: parsed.skipMongo,
      allowRoot: parsed.allowRoot,
      installMode: parsed.installMode,
      versionTarget: parsed.installMode === 'release' ? parsed.versionTarget : undefined,
      releaseBaseUrl: parsed.installMode === 'release' ? parsed.releaseBaseUrl : undefined,
      sourceRef: parsed.installMode === 'source' ? parsed.sourceRef : undefined,
      secretRef: commandId,
    };

    await Node.updateOne(
      { _id: id },
      {
        $push: {
          pendingCommands: {
            id: commandId,
            command: 'install-servermon',
            args: commandArgs,
            issuedAt: new Date(),
          },
        },
      }
    );

    await FleetLogEvent.create({
      nodeId: id,
      service: 'servermon',
      level: 'info',
      eventType: 'servermon.install_queued',
      message: `ServerMon install queued for ${node.name}`,
      metadata: {
        commandId,
        args: redactInstallArgs(commandArgs),
        routeIntent: parsed.createPublicRoute ? routeIntent : undefined,
      },
    });

    await recordAudit(FleetLogEvent, {
      action: 'servermon.install_queued',
      actorUserId: session.user.username,
      nodeId: id,
      service: 'servermon',
      message: `ServerMon install queued for ${node.name}`,
      metadata: {
        commandId,
        port: parsed.port,
        skipMongo: parsed.skipMongo,
        allowRoot: parsed.allowRoot,
        installMode: parsed.installMode,
        versionTarget: parsed.installMode === 'release' ? parsed.versionTarget : undefined,
        releaseBaseUrl: parsed.installMode === 'release' ? parsed.releaseBaseUrl : undefined,
        sourceRef: parsed.installMode === 'source' ? parsed.sourceRef : undefined,
        routeDomain: parsed.createPublicRoute ? routeIntent.domain : undefined,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        queued: true,
        commandId,
        routeIntent: parsed.createPublicRoute ? routeIntent : null,
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to queue ServerMon install', error);
    return NextResponse.json({ error: 'Failed to queue ServerMon install' }, { status: 500 });
  }
}
