import { NextRequest, NextResponse } from 'next/server';
import { ZodError, z } from 'zod';
import type { Model } from 'mongoose';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import AgentUpdateJob from '@/models/AgentUpdateJob';
import FleetLogEvent from '@/models/FleetLogEvent';
import { recordAudit } from '@/lib/fleet/audit';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:updates:detail');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

const ActionZ = z.object({
  action: z.enum(['cancel', 'pause', 'resume']),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getSession()) as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const job = await AgentUpdateJob.findById(id).lean();
    if (!job) {
      return NextResponse.json({ error: 'Update job not found' }, { status: 404 });
    }

    return NextResponse.json({ job });
  } catch (error) {
    log.error('Failed to fetch update job', error);
    return NextResponse.json({ error: 'Failed to fetch update job' }, { status: 500 });
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

    const job = await AgentUpdateJob.findById(id);
    if (!job) {
      return NextResponse.json({ error: 'Update job not found' }, { status: 404 });
    }

    const body = await req.json();
    const { action } = ActionZ.parse(body);

    const now = new Date();
    if (action === 'cancel') {
      job.status = 'cancelled';
      job.cancelledAt = now;
    } else if (action === 'pause') {
      job.status = 'paused';
      job.pausedAt = now;
    } else if (action === 'resume') {
      job.status = 'running';
      job.pausedAt = undefined;
    }

    await job.save();

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: `update_job.${action}`,
      actorUserId: session.user.username,
      service: 'update',
      metadata: { jobId: id },
    });

    return NextResponse.json({ job: job.toObject() });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to update update job', error);
    return NextResponse.json({ error: 'Failed to update update job' }, { status: 500 });
  }
}
