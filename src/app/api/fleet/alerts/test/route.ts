import { NextRequest, NextResponse } from 'next/server';
import { ZodError, z } from 'zod';
import type { Model } from 'mongoose';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import AlertChannel from '@/models/AlertChannel';
import FleetLogEvent from '@/models/FleetLogEvent';
import { recordAudit } from '@/lib/fleet/audit';
import { getSession } from '@/lib/session';
import { enforceRbac } from '@/lib/fleet/rbac';
import {
  dispatchAlert,
  type AlertDispatchDeps,
  type AlertPayload,
  type AlertSeverity,
} from '@/lib/fleet/alerts';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:alerts:test');

const TestAlertBody = z.object({
  channelId: z.string().min(1),
  payload: z
    .object({
      title: z.string().optional(),
      message: z.string().optional(),
      severity: z.enum(['info', 'warn', 'error']).optional(),
      eventKind: z.string().optional(),
      nodeId: z.string().optional(),
      routeId: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

export async function POST(req: NextRequest) {
  try {
    const session = (await getSession()) as SessionUser | null;
    const rbacResp = enforceRbac(session?.user, 'can_manage_alerts');
    if (rbacResp) return rbacResp;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const body = await req.json();
    const { channelId, payload } = TestAlertBody.parse(body);

    const channel = await AlertChannel.findById(channelId).lean();
    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    const testPayload: AlertPayload = {
      title: payload?.title ?? 'Test alert',
      message: payload?.message ?? 'This is a test alert from ServerMon',
      severity: (payload?.severity as AlertSeverity | undefined) ?? 'info',
      eventKind: payload?.eventKind ?? 'alert.test',
      nodeId: payload?.nodeId,
      routeId: payload?.routeId,
      metadata: payload?.metadata,
    };

    // For the test endpoint we bypass real subscription lookup and synthesize
    // a transient subscription that targets only the requested channel.
    const transientSub = {
      _id: `test-${channelId}`,
      name: 'test-subscription',
      channelId,
      eventKinds: [testPayload.eventKind],
      minSeverity: 'info' as const,
      enabled: true,
    };

    const deps: AlertDispatchDeps = {
      AlertChannel: {
        find: AlertChannel.find.bind(
          AlertChannel
        ) as unknown as AlertDispatchDeps['AlertChannel']['find'],
        findById: AlertChannel.findById.bind(
          AlertChannel
        ) as unknown as AlertDispatchDeps['AlertChannel']['findById'],
        findByIdAndUpdate: AlertChannel.findByIdAndUpdate.bind(
          AlertChannel
        ) as unknown as AlertDispatchDeps['AlertChannel']['findByIdAndUpdate'],
      },
      AlertSubscription: {
        find: () =>
          ({
            lean: async () => [transientSub],
            then: (cb: (v: unknown[]) => unknown) => Promise.resolve([transientSub]).then(cb),
          }) as never,
      },
      FleetLogEvent: {
        create: FleetLogEvent.create.bind(
          FleetLogEvent
        ) as unknown as AlertDispatchDeps['FleetLogEvent']['create'],
      },
    };

    const result = await dispatchAlert(testPayload, deps);

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'alert_channel.test',
      actorUserId: session.user.username,
      metadata: {
        channelId,
        dispatched: result.dispatched,
        failureCount: result.failures.length,
      },
    });

    if (result.failures.length > 0) {
      return NextResponse.json(
        { ok: false, dispatched: result.dispatched, failures: result.failures },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, dispatched: result.dispatched });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to send test alert', error);
    return NextResponse.json({ error: 'Failed to send test alert' }, { status: 500 });
  }
}
