import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import type { Model } from 'mongoose';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import AlertSubscription, { AlertSubscriptionZodSchema } from '@/models/AlertSubscription';
import FleetLogEvent from '@/models/FleetLogEvent';
import { recordAudit } from '@/lib/fleet/audit';
import { getSession } from '@/lib/session';
import { enforceRbac } from '@/lib/fleet/rbac';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:alerts:subscriptions');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

export async function GET() {
  try {
    const session = (await getSession()) as SessionUser | null;
    const rbacResp = enforceRbac(session?.user, 'can_manage_alerts');
    if (rbacResp) return rbacResp;

    await connectDB();
    const subscriptions = await AlertSubscription.find({}).sort({ updatedAt: -1 }).lean();
    return NextResponse.json({ subscriptions });
  } catch (error) {
    log.error('Failed to fetch alert subscriptions', error);
    return NextResponse.json({ error: 'Failed to fetch alert subscriptions' }, { status: 500 });
  }
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
    const parsed = AlertSubscriptionZodSchema.parse(body);

    const created = await AlertSubscription.create(parsed);

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'alert_subscription.create',
      actorUserId: session.user.username,
      metadata: {
        subscriptionId: String(created._id),
        channelId: parsed.channelId,
        eventKinds: parsed.eventKinds,
      },
    });

    return NextResponse.json({ subscription: created.toObject() }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to create alert subscription', error);
    return NextResponse.json({ error: 'Failed to create alert subscription' }, { status: 500 });
  }
}
