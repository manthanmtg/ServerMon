import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import type { Model } from 'mongoose';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import AgentUpdateJob, { AgentUpdateJobZodSchema } from '@/models/AgentUpdateJob';
import FleetLogEvent from '@/models/FleetLogEvent';
import { recordAudit } from '@/lib/fleet/audit';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:updates');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

export async function GET(req: NextRequest) {
  try {
    const session = (await getSession()) as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || '';

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;

    const jobs = await AgentUpdateJob.find(filter).sort({ createdAt: -1 }).lean();

    return NextResponse.json({ jobs });
  } catch (error) {
    log.error('Failed to fetch update jobs', error);
    return NextResponse.json({ error: 'Failed to fetch update jobs' }, { status: 500 });
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
    const parsed = AgentUpdateJobZodSchema.parse(body);

    const created = await AgentUpdateJob.create({
      ...parsed,
      status: 'pending',
      initiatedBy: session.user.username,
    });

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'update_job.create',
      actorUserId: session.user.username,
      service: 'update',
      metadata: {
        jobId: String(created._id),
        versionTarget: parsed.versionTarget,
      },
    });

    return NextResponse.json({ job: created.toObject() }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to create update job', error);
    return NextResponse.json({ error: 'Failed to create update job' }, { status: 500 });
  }
}
