import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import type { Model } from 'mongoose';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import AccessPolicy, { AccessPolicyZodSchema } from '@/models/AccessPolicy';
import FleetLogEvent from '@/models/FleetLogEvent';
import { recordAudit } from '@/lib/fleet/audit';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:access-policies');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

export async function GET() {
  try {
    const session = (await getSession()) as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const policies = await AccessPolicy.find({}).sort({ updatedAt: -1 }).lean();

    return NextResponse.json({ policies });
  } catch (error) {
    log.error('Failed to fetch access policies', error);
    return NextResponse.json({ error: 'Failed to fetch access policies' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = (await getSession()) as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const body = await req.json();
    const parsed = AccessPolicyZodSchema.parse(body);

    const created = await AccessPolicy.create(parsed);

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'access_policy.create',
      actorUserId: session.user.username,
      metadata: { policyId: String(created._id), name: parsed.name },
    });

    return NextResponse.json({ policy: created.toObject() }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to create access policy', error);
    return NextResponse.json({ error: 'Failed to create access policy' }, { status: 500 });
  }
}
