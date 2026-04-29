import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Node from '@/models/Node';
import { getSession } from '@/lib/session';
import { createLogger } from '@/lib/logger';
import { enforceRbac } from '@/lib/fleet/rbac';
import crypto from 'node:crypto';
import type { AgentUpdateMode } from '@/lib/fleet/agentUpdateCommand';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:nodes:updates');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

function parseString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseMode(value: unknown): AgentUpdateMode | undefined {
  return value === 'auto' || value === 'release' || value === 'source' ? value : undefined;
}

async function parseUpdateArgs(req: NextRequest): Promise<Record<string, string> | undefined> {
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return undefined;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return undefined;

  const args: Record<string, string> = {};
  const mode = parseMode(body.mode ?? body.updateMode ?? body.installMode);
  const versionTarget = parseString(body.versionTarget ?? body.version);
  const releaseBaseUrl = parseString(body.releaseBaseUrl);
  const sourceRef = parseString(body.sourceRef);

  if (mode) args.mode = mode;
  if (versionTarget) args.versionTarget = versionTarget;
  if (releaseBaseUrl) args.releaseBaseUrl = releaseBaseUrl;
  if (sourceRef) args.sourceRef = sourceRef;
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

    // Queue the update command
    await Node.updateOne(
      { _id: id },
      {
        $push: {
          pendingCommands: {
            id: crypto.randomBytes(8).toString('hex'),
            command: 'update',
            args: await parseUpdateArgs(req),
            issuedAt: new Date(),
          },
        },
      }
    );

    log.info(`Queued update command for node ${id} (${node.name})`);

    return NextResponse.json({ ok: true, queued: true });
  } catch (error) {
    log.error('Failed to queue agent update', error);
    return NextResponse.json({ error: 'Failed to queue update' }, { status: 500 });
  }
}
