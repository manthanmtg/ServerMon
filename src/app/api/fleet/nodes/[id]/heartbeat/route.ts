import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import Node from '@/models/Node';
import FleetLogEvent from '@/models/FleetLogEvent';
import { verifyPairingToken } from '@/lib/fleet/pairing';
import { HeartbeatZodSchema } from '@/lib/fleet/heartbeat';
import { fleetEventBus } from '@/lib/fleet/eventBus';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:nodes:heartbeat');

function extractBearer(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!auth) return null;
  const match = /^Bearer (.+)$/.exec(auth);
  return match ? match[1] : null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = extractBearer(req);
    if (!token) {
      log.warn(`Heartbeat rejected: No token for node ${id}`);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const node = await Node.findById(id);
    if (!node) {
      log.warn(`Heartbeat rejected: Node ${id} not found`);
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    if (!node.pairingTokenHash) {
      log.warn(`Heartbeat rejected: Node ${id} has no token hash`);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const valid = await verifyPairingToken(token, node.pairingTokenHash);
    if (!valid) {
      log.warn(`Heartbeat rejected: Invalid token for node ${id}`);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const raw = await req.json();
    let hb;
    try {
      hb = HeartbeatZodSchema.parse(raw);
    } catch (ve) {
      if (ve instanceof ZodError) {
        log.warn(`Heartbeat data validation failed for node ${id}:`, ve.format());
        return NextResponse.json({ error: 'Invalid input', details: ve.issues }, { status: 400 });
      }
      throw ve;
    }

    const now = new Date();
    const previousBootId = node.bootId;
    const previousTunnelStatus = node.tunnelStatus;

    node.lastSeen = now;
    node.bootId = hb.bootId;
    if (previousBootId && previousBootId !== hb.bootId) {
      node.lastBootAt = hb.bootAt;
      await FleetLogEvent.create({
        nodeId: id,
        service: 'agent',
        level: 'info',
        eventType: 'node.reboot_detected',
        message: 'Agent reported a new boot id',
        metadata: { previousBootId, newBootId: hb.bootId },
      });
    } else if (!previousBootId) {
      node.lastBootAt = hb.bootAt;
    }

    node.agentVersion = hb.agentVersion;
    if (hb.frpcVersion !== undefined) node.frpcVersion = hb.frpcVersion;
    node.hardware = hb.hardware;
    node.metrics = {
      cpuLoad: hb.metrics.cpuLoad,
      ramUsed: hb.metrics.ramUsed,
      uptime: hb.metrics.uptime,
      capturedAt: now,
    };

    node.tunnelStatus = hb.tunnel.status;
    if (hb.tunnel.connectedSince) {
      node.connectedSince = hb.tunnel.connectedSince;
    }

    if (previousTunnelStatus === 'disconnected' && hb.tunnel.status === 'connected') {
      await FleetLogEvent.create({
        nodeId: id,
        service: 'agent',
        level: 'info',
        eventType: 'node.reconnected',
        message: 'Agent tunnel reconnected',
      });
    }

    if (Array.isArray(node.proxyRules)) {
      for (const p of node.proxyRules) {
        const match = hb.proxies.find((x) => x.name === p.name);
        if (match) {
          p.status = match.status;
          if (match.lastError !== undefined) p.lastError = match.lastError;
        }
      }
    }

    node.capabilities = {
      terminal: hb.capabilities.terminal ?? node.capabilities?.terminal ?? true,
      endpointRuns: hb.capabilities.endpointRuns ?? node.capabilities?.endpointRuns ?? true,
      processes: hb.capabilities.processes ?? node.capabilities?.processes ?? true,
      metrics: hb.capabilities.metrics ?? node.capabilities?.metrics ?? true,
      publishRoutes: hb.capabilities.publishRoutes ?? node.capabilities?.publishRoutes ?? true,
      tcpForward: hb.capabilities.tcpForward ?? node.capabilities?.tcpForward ?? true,
      fileOps: hb.capabilities.fileOps ?? node.capabilities?.fileOps ?? false,
      updates: hb.capabilities.updates ?? node.capabilities?.updates ?? true,
    };

    await node.save();

    const now2 = new Date().toISOString();
    fleetEventBus.emit({
      kind: 'node.heartbeat',
      nodeId: id,
      at: now2,
      data: { tunnelStatus: hb.tunnel.status, lastSeen: now.toISOString() },
    });
    if (previousBootId && previousBootId !== hb.bootId) {
      fleetEventBus.emit({
        kind: 'node.reboot',
        nodeId: id,
        at: now2,
        data: {
          previousBootId,
          newBootId: hb.bootId,
          bootAt: hb.bootAt,
        },
      });
    }
    if (previousTunnelStatus !== hb.tunnel.status) {
      fleetEventBus.emit({
        kind: 'node.status_change',
        nodeId: id,
        at: now2,
        data: { from: previousTunnelStatus, to: hb.tunnel.status },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to process heartbeat', error);
    return NextResponse.json({ error: 'Failed to process heartbeat' }, { status: 400 });
  }
}
