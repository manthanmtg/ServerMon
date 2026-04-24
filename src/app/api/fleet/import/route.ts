import { NextRequest, NextResponse } from 'next/server';
import { ZodError, z } from 'zod';
import type { Model } from 'mongoose';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import ImportedConfig from '@/models/ImportedConfig';
import Node from '@/models/Node';
import PublicRoute from '@/models/PublicRoute';
import FleetLogEvent from '@/models/FleetLogEvent';
import { parseFrpConfig, parseNginxConfig, detectConflicts } from '@/lib/fleet/import';
import { recordAudit } from '@/lib/fleet/audit';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:import');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

const BodyZ = z.object({
  kind: z.enum(['frp', 'nginx']),
  raw: z.string().min(1).max(500000),
  sourcePath: z.string().max(500).optional(),
});

interface NodeLike {
  proxyRules?: Array<{ name?: string; remotePort?: number }>;
}

export async function POST(req: NextRequest) {
  try {
    const session = (await getSession()) as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const body = await req.json();
    const { kind, raw, sourcePath } = BodyZ.parse(body);

    const parsed = kind === 'frp' ? parseFrpConfig(raw) : parseNginxConfig(raw);

    const [nodes, routes] = await Promise.all([
      Node.find({}).select('proxyRules').lean() as unknown as Promise<NodeLike[]>,
      PublicRoute.find({}).select('domain').lean() as unknown as Promise<Array<{ domain: string }>>,
    ]);
    const nodeProxyNames: string[] = [];
    const usedRemotePorts: number[] = [];
    for (const n of nodes) {
      for (const p of n.proxyRules ?? []) {
        if (p.name) nodeProxyNames.push(p.name);
        if (typeof p.remotePort === 'number') usedRemotePorts.push(p.remotePort);
      }
    }
    const publicDomains = routes.map((r) => r.domain);

    const parsedInput =
      kind === 'frp'
        ? { frp: parsed as ReturnType<typeof parseFrpConfig> }
        : { nginx: parsed as ReturnType<typeof parseNginxConfig> };

    const conflicts = detectConflicts(parsedInput, {
      nodeProxyNames,
      publicDomains,
      usedRemotePorts,
    });
    const conflictStrings = conflicts.map((c) => `${c.type}: ${c.detail}`);

    const created = await ImportedConfig.create({
      kind,
      sourcePath,
      raw,
      parsed,
      status: 'unmanaged',
      conflicts: conflictStrings,
      importedAt: new Date(),
      importedBy: session.user.username,
    });

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'import.create',
      actorUserId: session.user.username,
      metadata: {
        importId: String(created._id),
        kind,
        conflictCount: conflictStrings.length,
      },
    });

    return NextResponse.json(
      { imported: created.toObject(), conflicts: conflictStrings },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to import config', error);
    return NextResponse.json({ error: 'Failed to import config' }, { status: 500 });
  }
}
