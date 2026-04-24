import { NextRequest, NextResponse } from 'next/server';
import { ZodError, z } from 'zod';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import ImportedConfig from '@/models/ImportedConfig';
import Node from '@/models/Node';
import PublicRoute from '@/models/PublicRoute';
import { parseNginxConfig, detectConflicts } from '@/lib/fleet/import';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:nginx:import');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

const BodyZ = z.object({
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
    const { raw, sourcePath } = BodyZ.parse(body);

    const parsed = parseNginxConfig(raw);

    // Build existing state for conflict detection.
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

    const conflicts = detectConflicts(
      { nginx: parsed },
      { nodeProxyNames, publicDomains, usedRemotePorts }
    );

    const conflictStrings = conflicts.map((c) => `${c.type}: ${c.detail}`);

    const created = await ImportedConfig.create({
      kind: 'nginx',
      sourcePath,
      raw,
      parsed,
      status: 'unmanaged',
      conflicts: conflictStrings,
      importedAt: new Date(),
      importedBy: session.user.username,
    });

    return NextResponse.json(
      {
        imported: created.toObject(),
        conflicts: conflictStrings,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to import nginx config', error);
    return NextResponse.json({ error: 'Failed to import nginx config' }, { status: 500 });
  }
}
