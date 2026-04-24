import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import type { Model } from 'mongoose';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import AlertChannel, { AlertChannelZodSchema } from '@/models/AlertChannel';
import FleetLogEvent from '@/models/FleetLogEvent';
import { recordAudit } from '@/lib/fleet/audit';
import { getSession } from '@/lib/session';
import { enforceRbac } from '@/lib/fleet/rbac';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:alerts:channels:detail');

const PatchZ = AlertChannelZodSchema.partial();

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

    const channel = await AlertChannel.findById(id).lean();
    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }
    return NextResponse.json({ channel });
  } catch (error) {
    log.error('Failed to fetch alert channel', error);
    return NextResponse.json({ error: 'Failed to fetch alert channel' }, { status: 500 });
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

    const existing = await AlertChannel.findById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    const body = await req.json();
    const updates = PatchZ.parse(body);

    const updated = await AlertChannel.findByIdAndUpdate(id, updates, { new: true });
    if (!updated) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'alert_channel.update',
      actorUserId: session.user.username,
      metadata: { channelId: id },
    });

    return NextResponse.json({ channel: updated.toObject() });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to update alert channel', error);
    return NextResponse.json({ error: 'Failed to update alert channel' }, { status: 500 });
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

    const channel = await AlertChannel.findById(id);
    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    await AlertChannel.findByIdAndDelete(id);

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'alert_channel.delete',
      actorUserId: session.user.username,
      metadata: { channelId: id },
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    log.error('Failed to delete alert channel', error);
    return NextResponse.json({ error: 'Failed to delete alert channel' }, { status: 500 });
  }
}
