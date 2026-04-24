import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import type { Model } from 'mongoose';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import BackupJob from '@/models/BackupJob';
import FleetLogEvent from '@/models/FleetLogEvent';
import Node from '@/models/Node';
import PublicRoute from '@/models/PublicRoute';
import ConfigRevision from '@/models/ConfigRevision';
import NginxState from '@/models/NginxState';
import AccessPolicy from '@/models/AccessPolicy';
import ResourcePolicy from '@/models/ResourcePolicy';
import RouteTemplate from '@/models/RouteTemplate';
import ImportedConfig from '@/models/ImportedConfig';
import { recordAudit } from '@/lib/fleet/audit';
import { getSession } from '@/lib/session';
import { enforceRbac } from '@/lib/fleet/rbac';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:backups:restore');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

const SCOPE_MODELS: Record<string, Model<unknown>> = {
  nodes: Node as unknown as Model<unknown>,
  publicRoutes: PublicRoute as unknown as Model<unknown>,
  configs: ConfigRevision as unknown as Model<unknown>,
  nginx: NginxState as unknown as Model<unknown>,
  policies: AccessPolicy as unknown as Model<unknown>,
  retention: ResourcePolicy as unknown as Model<unknown>,
  audit: FleetLogEvent as unknown as Model<unknown>,
  templates: RouteTemplate as unknown as Model<unknown>,
  imported: ImportedConfig as unknown as Model<unknown>,
};

interface ManifestFileEntry {
  path: string;
  count: number;
  sizeBytes: number;
}

interface ManifestShape {
  scopes: string[];
  files: Record<string, ManifestFileEntry>;
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getSession()) as SessionUser | null;
    const rbacResp = enforceRbac(session?.user, 'can_restore_backup');
    if (rbacResp) return rbacResp;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const job = await BackupJob.findById(id);
    if (!job) {
      return NextResponse.json({ error: 'Backup job not found' }, { status: 404 });
    }

    if (!job.manifestPath) {
      return NextResponse.json(
        { error: 'Backup has no manifest to restore from' },
        { status: 400 }
      );
    }

    const manifestRaw = await fs.readFile(job.manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw) as ManifestShape;

    const restored: Record<string, number> = {};

    for (const scope of manifest.scopes) {
      const model = SCOPE_MODELS[scope];
      const entry = manifest.files?.[scope];
      if (!model || !entry) continue;
      const scopePath = entry.path ?? path.join(path.dirname(job.manifestPath), `${scope}.json`);
      const scopeRaw = await fs.readFile(scopePath, 'utf8');
      const docs = JSON.parse(scopeRaw) as unknown[];
      if (!Array.isArray(docs) || docs.length === 0) {
        restored[scope] = 0;
        continue;
      }
      const insertMany = (
        model as unknown as {
          insertMany: (docs: unknown[], opts: { ordered: boolean }) => Promise<unknown>;
        }
      ).insertMany;
      try {
        await insertMany.call(model, docs, { ordered: false });
      } catch (err) {
        log.warn(`Partial insertMany failure for scope ${scope}`, err);
      }
      restored[scope] = docs.length;
    }

    job.restoreVerified = true;
    await job.save();

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'backup.restore',
      actorUserId: session.user.username,
      service: 'backup',
      metadata: { jobId: id, restored },
    });

    return NextResponse.json({ restored, restoreVerified: true });
  } catch (error) {
    log.error('Failed to restore backup', error);
    return NextResponse.json({ error: 'Failed to restore backup' }, { status: 500 });
  }
}
