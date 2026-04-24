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

const log = createLogger('api:fleet:alerts:subscriptions:detail');

const PatchZ = AlertSubscriptionZodSchema.partial();

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getSession()) as SessionUser | null;
    const rbacResp = enforceRbac(session?.user, 'can_manage_alerts');
    if (rbacResp) return rbacResp;

    await connectDB();
    const { id } = await params;

    const subscription = await AlertSubscription.findById(id).lean();
    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }
    return NextResponse.json({ subscription });
  } catch (error) {
    log.error('Failed to fetch alert subscription', error);
    return NextResponse.json({ error: 'Failed to fetch alert subscription' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getSession()) as SessionUser | null;
    const rbacResp = enforceRbac(session?.user, 'can_manage_alerts');
    if (rbacResp) return rbacResp;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const existing = await AlertSubscription.findById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    const body = await req.json();
    const updates = PatchZ.parse(body);

    const updated = await AlertSubscription.findByIdAndUpdate(id, updates, { new: true });
    if (!updated) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'alert_subscription.update',
      actorUserId: session.user.username,
      metadata: { subscriptionId: id },
    });

    return NextResponse.json({ subscription: updated.toObject() });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to update alert subscription', error);
    return NextResponse.json({ error: 'Failed to update alert subscription' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getSession()) as SessionUser | null;
    const rbacResp = enforceRbac(session?.user, 'can_manage_alerts');
    if (rbacResp) return rbacResp;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const sub = await AlertSubscription.findById(id);
    if (!sub) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    await AlertSubscription.findByIdAndDelete(id);

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'alert_subscription.delete',
      actorUserId: session.user.username,
      metadata: { subscriptionId: id },
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    log.error('Failed to delete alert subscription', error);
    return NextResponse.json({ error: 'Failed to delete alert subscription' }, { status: 500 });
  }
}
