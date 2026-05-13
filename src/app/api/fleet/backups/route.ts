import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import path from 'node:path';
import type { Model } from 'mongoose';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import BackupJob, { BackupJobZodSchema } from '@/models/BackupJob';
import FleetLogEvent from '@/models/FleetLogEvent';
import Node from '@/models/Node';
import PublicRoute from '@/models/PublicRoute';
import ConfigRevision from '@/models/ConfigRevision';
import NginxState from '@/models/NginxState';
import AccessPolicy from '@/models/AccessPolicy';
import ResourcePolicy from '@/models/ResourcePolicy';
import RouteTemplate from '@/models/RouteTemplate';
import ImportedConfig from '@/models/ImportedConfig';
import { writeBackupSnapshot } from '@/lib/fleet/backup';
import { recordAudit } from '@/lib/fleet/audit';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:backups');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

const SCOPE_MODELS: Record<string, Model<any>> = { // eslint-disable-line @typescript-eslint/no-explicit-any -- Generic model collection for bulk backups
  nodes: Node,
  publicRoutes: PublicRoute,
  configs: ConfigRevision,
  nginx: NginxState,
  policies: AccessPolicy,
  retention: ResourcePolicy,
  templates: RouteTemplate,
  imported: ImportedConfig,
};

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

    const jobs = await BackupJob.find(filter).sort({ createdAt: -1 }).lean();

    return NextResponse.json({ jobs });
  } catch (error) {
    log.error('Failed to fetch backup jobs', error);
    return NextResponse.json({ error: 'Failed to fetch backup jobs' }, { status: 500 });
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
    const parsed = BackupJobZodSchema.parse(body);

    const created = await BackupJob.create({
      ...parsed,
      status: 'queued',
      initiatedBy: session.user.username,
      startedAt: new Date(),
    });

    const jobId = String(created._id);
    const baseDir = process.env.FLEET_BACKUP_DIR ?? './.fleet-backups';
    const destinationPath = path.join(baseDir, jobId);

    try {
      const result = await writeBackupSnapshot(destinationPath, {
        scopes: parsed.scopes,
        models: SCOPE_MODELS,
      });

      created.status = 'completed';
      created.manifestPath = result.manifestPath;
      created.sizeBytes = result.sizeBytes;
      created.finishedAt = new Date();
      await created.save();
    } catch (backupError) {
      created.status = 'failed';
      created.error = backupError instanceof Error ? backupError.message : String(backupError);
      created.finishedAt = new Date();
      await created.save();
      log.error('Backup snapshot failed', backupError);
    }

    await recordAudit(FleetLogEvent, {
      action: 'backup.create',
      actorUserId: session.user.username,
      service: 'backup',
      metadata: {
        jobId,
        scopes: parsed.scopes,
        status: created.status,
      },
    });

    return NextResponse.json({ job: created.toObject() }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to create backup job', error);
    return NextResponse.json({ error: 'Failed to create backup job' }, { status: 500 });
  }
}
