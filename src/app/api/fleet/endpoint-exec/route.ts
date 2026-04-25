import { NextRequest, NextResponse } from 'next/server';
import { ZodError, z } from 'zod';
import type { Model } from 'mongoose';
import crypto from 'node:crypto';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import CustomEndpoint from '@/models/CustomEndpoint';
import Node from '@/models/Node';
import FleetLogEvent from '@/models/FleetLogEvent';
import ResourcePolicy from '@/models/ResourcePolicy';
import { recordAudit } from '@/lib/fleet/audit';
import { fleetEventBus } from '@/lib/fleet/eventBus';
import { getSession } from '@/lib/session';
import { enforceRbac } from '@/lib/fleet/rbac';
import { enforceResourceGuard } from '@/lib/fleet/resourceGuardMiddleware';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:endpoint-exec');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

const TargetZ = z.object({
  mode: z.enum(['local', 'single', 'fleet', 'tag', 'list']),
  nodeIds: z.array(z.string()).default([]),
  tag: z.string().optional(),
});

const BodyZ = z.object({
  endpointId: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional(),
  overrideTarget: TargetZ.optional(),
});

type ResolvedTarget = z.infer<typeof TargetZ>;

const DISPATCH_RESULT_EVENT_TYPES = [
  'endpoint.dispatched',
  'endpoint.succeeded',
  'endpoint.failed',
] as const;

async function resolveNodeIds(target: ResolvedTarget): Promise<string[]> {
  switch (target.mode) {
    case 'local':
      return [];
    case 'single':
      return target.nodeIds[0] ? [target.nodeIds[0]] : [];
    case 'list':
      return target.nodeIds;
    case 'fleet': {
      const nodes = await Node.find({
        status: { $in: ['online', 'degraded', 'connecting'] },
      })
        .select('_id')
        .lean();
      return nodes.map((n: { _id: unknown }) => String(n._id));
    }
    case 'tag': {
      if (!target.tag) return [];
      const nodes = await Node.find({ tags: target.tag }).select('_id').lean();
      return nodes.map((n: { _id: unknown }) => String(n._id));
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = (await getSession()) as SessionUser | null;
    const rbacResp = enforceRbac(session?.user, 'can_dispatch_endpoint');
    if (rbacResp) return rbacResp;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const body = await req.json();
    const parsed = BodyZ.parse(body);

    const endpoint = await CustomEndpoint.findById(parsed.endpointId).lean();
    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint not found' }, { status: 404 });
    }

    const resolvedTarget: ResolvedTarget = parsed.overrideTarget ?? {
      mode: (endpoint.target?.mode ?? 'local') as ResolvedTarget['mode'],
      nodeIds: endpoint.target?.nodeIds ?? [],
      tag: endpoint.target?.tag,
    };

    if (resolvedTarget.mode === 'local') {
      return NextResponse.json(
        { error: 'use local endpoint runner for mode=local' },
        { status: 400 }
      );
    }

    const startOfHour = new Date();
    startOfHour.setMinutes(0, 0, 0);
    const guard = await enforceResourceGuard({
      key: 'maxEndpointRuns',
      scope: 'global',
      currentCounter: () =>
        FleetLogEvent.countDocuments({
          eventType: 'endpoint.dispatched',
          createdAt: { $gte: startOfHour },
        }),
      ResourcePolicy: ResourcePolicy as unknown as Parameters<
        typeof enforceResourceGuard
      >[0]['ResourcePolicy'],
      FleetLogEvent: FleetLogEvent as unknown as Parameters<
        typeof enforceResourceGuard
      >[0]['FleetLogEvent'],
      actorUserId: session.user.username,
    });
    if (!guard.allowed) {
      return NextResponse.json(
        {
          error: 'Resource limit exceeded',
          limit: guard.limit,
          current: guard.current,
          message: guard.message,
        },
        { status: 429 }
      );
    }

    const nodeIds = await resolveNodeIds(resolvedTarget);
    const commandId = crypto.randomBytes(8).toString('hex');

    for (const nodeId of nodeIds) {
      // 1. Queue command in the node's pendingCommands for agent pickup
      await Node.updateOne(
        { _id: nodeId },
        {
          $push: {
            pendingCommands: {
              id: commandId,
              command: 'endpoint-run',
              args: {
                endpointId: parsed.endpointId,
                endpointSlug: endpoint.slug,
                endpointType: endpoint.endpointType,
                scriptLang: endpoint.scriptLang,
                scriptContent: endpoint.scriptContent,
                timeout: endpoint.timeout,
                envVars: endpoint.envVars,
                payload: parsed.payload,
                method: endpoint.method,
              },
              issuedAt: new Date(),
            },
          },
        }
      );

      // 2. Create dispatch log event
      await FleetLogEvent.create({
        service: 'endpoint-runner',
        level: 'info',
        eventType: 'endpoint.dispatched',
        nodeId,
        message: `Endpoint ${endpoint.slug} dispatched to node`,
        metadata: {
          commandId,
          endpointId: parsed.endpointId,
          endpointSlug: endpoint.slug,
          payload: parsed.payload,
        },
      });

      // 3. Emit bus event for real-time UI updates
      fleetEventBus.emit({
        kind: 'node.heartbeat',
        nodeId,
        at: new Date().toISOString(),
        data: {
          type: 'endpoint.dispatched',
          commandId,
          endpointId: parsed.endpointId,
          endpointSlug: endpoint.slug,
        },
      });
    }

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'endpoint.fleet_dispatch',
      actorUserId: session.user.username,
      service: 'endpoint-runner',
      message: `Fleet endpoint dispatch: ${endpoint.slug}`,
      metadata: {
        endpointId: parsed.endpointId,
        endpointSlug: endpoint.slug,
        target: resolvedTarget,
        dispatched: nodeIds,
      },
    });

    return NextResponse.json({
      dispatched: nodeIds,
      endpointId: parsed.endpointId,
      endpointSlug: endpoint.slug,
      target: resolvedTarget,
      status: 'queued',
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to dispatch fleet endpoint', error);
    return NextResponse.json({ error: 'Failed to dispatch fleet endpoint' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = (await getSession()) as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(req.url);
    const endpointId = searchParams.get('endpointId') || '';
    const since = searchParams.get('since') || '';

    if (!endpointId) {
      return NextResponse.json({ error: 'endpointId is required' }, { status: 400 });
    }

    const filter: Record<string, unknown> = {
      eventType: { $in: DISPATCH_RESULT_EVENT_TYPES },
      'metadata.endpointId': endpointId,
    };
    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        filter.createdAt = { $gte: sinceDate };
      }
    }

    const events = await FleetLogEvent.find(filter).sort({ createdAt: -1 }).limit(500).lean();

    return NextResponse.json({ events });
  } catch (error) {
    log.error('Failed to fetch endpoint dispatch events', error);
    return NextResponse.json(
      { error: 'Failed to fetch endpoint dispatch events' },
      { status: 500 }
    );
  }
}
