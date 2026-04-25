import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import Node from '@/models/Node';
import FleetLogEvent from '@/models/FleetLogEvent';
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
    const token = extractBearer(req);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const node = await Node.findById(id);
    if (!node) {
      log.warn(`Heartbeat rejected: Node ${id} not found`);
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    const raw = await req.json();
    let hb;
    try {
      hb = HeartbeatZodSchema.parse(raw);
    } catch (ve) {
      if (ve instanceof Error) {
        log.error('Invalid heartbeat payload', { error: ve.message, nodeId: id });
      }
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const now = new Date();
    const previousBootId = node.bootId;
    const previousTunnelStatus = node.tunnelStatus;

    // Use a targeted update instead of node.save() to avoid race conditions 
    // with pendingCommands being pushed by other routes (like endpoint-exec).
    const updateData: any = {
      $set: {
        lastSeen: now,
        bootId: hb.bootId,
        agentVersion: hb.agentVersion,
        hardware: hb.hardware,
        metrics: {
          cpuLoad: hb.metrics.cpuLoad,
          ramUsed: hb.metrics.ramUsed,
          uptime: hb.metrics.uptime,
          capturedAt: now,
        },
        tunnelStatus: hb.tunnel.status,
        capabilities: {
          terminal: hb.capabilities.terminal ?? node.capabilities?.terminal ?? true,
          endpointRuns: hb.capabilities.endpointRuns ?? node.capabilities?.endpointRuns ?? true,
          processes: hb.capabilities.processes ?? node.capabilities?.processes ?? true,
          metrics: hb.capabilities.metrics ?? node.capabilities?.metrics ?? true,
          publishRoutes: hb.capabilities.publishRoutes ?? node.capabilities?.publishRoutes ?? true,
          tcpForward: hb.capabilities.tcpForward ?? node.capabilities?.tcpForward ?? true,
          fileOps: hb.capabilities.fileOps ?? node.capabilities?.fileOps ?? false,
          updates: hb.capabilities.updates ?? node.capabilities?.updates ?? true,
        }
      }
    };

    if (hb.frpcVersion !== undefined) updateData.$set.frpcVersion = hb.frpcVersion;
    if (hb.tunnel.connectedSince) updateData.$set.connectedSince = hb.tunnel.connectedSince;
    if (previousBootId !== hb.bootId) updateData.$set.lastBootAt = hb.bootAt;
    
    if (hb.tunnel.status === 'connected' && (node.status === 'connecting' || node.status === 'unpaired')) {
      updateData.$set.status = 'online';
    }

    if (hb.ptyBridge) {
      updateData.$set.ptyBridge = {
        port: hb.ptyBridge.port,
        authToken: hb.ptyBridge.authToken,
      };
    }

    // Proxy rules need special handling because they are an array of subdocs
    if (Array.isArray(node.proxyRules) && hb.proxies.length > 0) {
      const updatedRules = [...node.proxyRules];
      for (const p of updatedRules) {
        const match = hb.proxies.find((x) => x.name === p.name);
        if (match) {
          p.status = match.status;
          if (match.lastError !== undefined) p.lastError = match.lastError;
        }
      }
      updateData.$set.proxyRules = updatedRules;
    }

    // Execute the update and RELOAD the node to get latest pendingCommands
    const updatedNode = await Node.findByIdAndUpdate(id, updateData, { returnDocument: 'after' }).lean();
    if (!updatedNode) {
      return NextResponse.json({ error: 'Node lost' }, { status: 404 });
    }

    // Persist a metrics sample for the charts
    await FleetLogEvent.create({
      nodeId: id,
      service: 'agent',
      level: 'info',
      eventType: 'metrics_sample',
      message: `Metrics sample from ${id}`,
      metadata: {
        cpuLoad: hb.metrics.cpuLoad,
        ramUsed: hb.metrics.ramUsed,
        uptime: hb.metrics.uptime,
      },
    }).catch((err) => log.warn('Failed to insert metrics sample', err));

    // Persist any agent-side log entries...
    if (Array.isArray(hb.logs) && hb.logs.length > 0) {
      const docs = hb.logs.map((entry) => ({
        nodeId: id,
        service: 'agent',
        level: entry.level || 'info',
        eventType: entry.eventType,
        message: entry.message,
        metadata: entry.metadata,
        createdAt: entry.timestamp ?? now,
      }));
      await FleetLogEvent.insertMany(docs, { ordered: false }).catch((err) =>
        log.warn('Failed to insert agent logs', err)
      );
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

    const nowIso = now.toISOString();
    fleetEventBus.emit({
      kind: 'node.heartbeat',
      nodeId: id,
      at: nowIso,
      data: { tunnelStatus: hb.tunnel.status, lastSeen: now.toISOString() },
    });

    if (previousBootId && previousBootId !== hb.bootId) {
      await FleetLogEvent.create({
        nodeId: id,
        service: 'agent',
        level: 'info',
        eventType: 'node.reboot_detected',
        message: 'Agent reported a new boot id',
        metadata: { previousBootId, newBootId: hb.bootId },
      });

      fleetEventBus.emit({
        kind: 'node.reboot',
        nodeId: id,
        at: nowIso,
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
        at: nowIso,
        data: { from: previousTunnelStatus, to: hb.tunnel.status },
      });
    }

    const commands = (updatedNode as any).pendingCommands || [];
    if (commands.length > 0) {
      await Node.updateOne({ _id: id }, { $set: { pendingCommands: [] } });
    }

    return NextResponse.json({ ok: true, commands });
  } catch (error) {
    log.error('Failed to process heartbeat', error);
    return NextResponse.json({ error: 'Failed to process heartbeat' }, { status: 400 });
  }
}
