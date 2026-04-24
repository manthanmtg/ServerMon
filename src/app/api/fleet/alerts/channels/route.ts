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

const log = createLogger('api:fleet:alerts:channels');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

export async function GET() {
  try {
    const session = (await getSession()) as SessionUser | null;
    const rbacResp = enforceRbac(session?.user, 'can_manage_alerts');
    if (rbacResp) return rbacResp;

    await connectDB();

    const channels = await AlertChannel.find({}).sort({ updatedAt: -1 }).lean();
    return NextResponse.json({ channels });
  } catch (error) {
    log.error('Failed to fetch alert channels', error);
    return NextResponse.json({ error: 'Failed to fetch alert channels' }, { status: 500 });
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
    const parsed = AlertChannelZodSchema.parse(body);

    const created = await AlertChannel.create(parsed);

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'alert_channel.create',
      actorUserId: session.user.username,
      metadata: { channelId: String(created._id), slug: parsed.slug, kind: parsed.kind },
    });

    return NextResponse.json({ channel: created.toObject() }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to create alert channel', error);
    return NextResponse.json({ error: 'Failed to create alert channel' }, { status: 500 });
  }
}
