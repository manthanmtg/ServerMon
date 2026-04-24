import { NextRequest, NextResponse } from 'next/server';
import type { Model } from 'mongoose';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import BackupJob from '@/models/BackupJob';
import FleetLogEvent from '@/models/FleetLogEvent';
import { recordAudit } from '@/lib/fleet/audit';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:backups:detail');

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

    const job = await BackupJob.findById(id).lean();
    if (!job) {
      return NextResponse.json({ error: 'Backup job not found' }, { status: 404 });
    }

    return NextResponse.json({ job });
  } catch (error) {
    log.error('Failed to fetch backup job', error);
    return NextResponse.json({ error: 'Failed to fetch backup job' }, { status: 500 });
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

    const job = await BackupJob.findById(id);
    if (!job) {
      return NextResponse.json({ error: 'Backup job not found' }, { status: 404 });
    }

    await BackupJob.findByIdAndDelete(id);

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'backup.delete',
      actorUserId: session.user.username,
      service: 'backup',
      metadata: { jobId: id },
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    log.error('Failed to delete backup job', error);
    return NextResponse.json({ error: 'Failed to delete backup job' }, { status: 500 });
  }
}
