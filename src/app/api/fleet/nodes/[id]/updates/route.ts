import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/db';
import Node from '@/models/Node';
import { getSession } from '@/lib/session';
import { createLogger } from '@/lib/logger';
import { enforceRbac } from '@/lib/fleet/rbac';
import FleetLogEvent from '@/models/FleetLogEvent';
import crypto from 'node:crypto';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:nodes:updates');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

const UpdateArgsSchema = z.object({
  mode: z.enum(['auto', 'release', 'source']).optional(),
  updateMode: z.enum(['auto', 'release', 'source']).optional(),
  installMode: z.enum(['auto', 'release', 'source']).optional(),
  versionTarget: z.string().trim().min(1).optional(),
  version: z.string().trim().min(1).optional(),
  releaseBaseUrl: z.string().trim().min(1).optional(),
  sourceRef: z.string().trim().min(1).optional(),
});

async function parseUpdateArgs(req: NextRequest): Promise<Record<string, string> | undefined> {
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return undefined;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return undefined;

  const result = UpdateArgsSchema.safeParse(body);
  if (!result.success) return undefined;

  const data = result.data;
  const args: Record<string, string> = {};

  const mode = data.mode ?? data.updateMode ?? data.installMode;
  const versionTarget = data.versionTarget ?? data.version;

  if (mode) args.mode = mode;
  if (versionTarget) args.versionTarget = versionTarget;
  if (data.releaseBaseUrl) args.releaseBaseUrl = data.releaseBaseUrl;
  if (data.sourceRef) args.sourceRef = data.sourceRef;

  return Object.keys(args).length ? args : undefined;
}

/**
 * Endpoint to trigger an agent update.
 * Queues an 'update' command which will be picked up by the agent on its next heartbeat.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getSession()) as SessionUser | null;
    const rbacResp = enforceRbac(session?.user, 'can_mutate_node_config');
    if (rbacResp) return rbacResp;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const node = await Node.findById(id);
    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    const commandId = crypto.randomBytes(8).toString('hex');
    const args = await parseUpdateArgs(req);

    // Queue the update command
    await Node.updateOne(
      { _id: id },
      {
        $push: {
          pendingCommands: {
            id: commandId,
            command: 'update',
            args,
            issuedAt: new Date(),
          },
        },
      }
    );

    await FleetLogEvent.create({
      nodeId: id,
      service: 'agent',
      level: 'info',
      eventType: 'agent.update.queued',
      message: `Agent update queued for ${node.name}`,
      metadata: { commandId, args },
    });

    log.info(`Queued update command for node ${id} (${node.name})`);

    return NextResponse.json({ ok: true, queued: true, commandId });
  } catch (error) {
    log.error('Failed to queue agent update', error);
    return NextResponse.json({ error: 'Failed to queue update' }, { status: 500 });
  }
}
