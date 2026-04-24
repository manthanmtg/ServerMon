import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import type { Model } from 'mongoose';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import ResourcePolicy, { ResourcePolicyZodSchema } from '@/models/ResourcePolicy';
import FleetLogEvent from '@/models/FleetLogEvent';
import { recordAudit } from '@/lib/fleet/audit';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:resource-policies:detail');

const PatchZ = ResourcePolicyZodSchema.partial();

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getSession()) as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const policy = await ResourcePolicy.findById(id).lean();
    if (!policy) {
      return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
    }

    return NextResponse.json({ policy });
  } catch (error) {
    log.error('Failed to fetch resource policy', error);
    return NextResponse.json({ error: 'Failed to fetch resource policy' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getSession()) as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const existing = await ResourcePolicy.findById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
    }

    const body = await req.json();
    const updates = PatchZ.parse(body);

    const updated = await ResourcePolicy.findByIdAndUpdate(id, updates, {
      new: true,
    });
    if (!updated) {
      return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
    }

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'resource_policy.update',
      actorUserId: session.user.username,
      metadata: { policyId: id },
    });

    return NextResponse.json({ policy: updated.toObject() });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to update resource policy', error);
    return NextResponse.json({ error: 'Failed to update resource policy' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getSession()) as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const policy = await ResourcePolicy.findById(id);
    if (!policy) {
      return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
    }

    await ResourcePolicy.findByIdAndDelete(id);

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'resource_policy.delete',
      actorUserId: session.user.username,
      metadata: { policyId: id },
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    log.error('Failed to delete resource policy', error);
    return NextResponse.json({ error: 'Failed to delete resource policy' }, { status: 500 });
  }
}
