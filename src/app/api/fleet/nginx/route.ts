import { NextRequest, NextResponse } from 'next/server';
import { ZodError, z } from 'zod';
import type { Model } from 'mongoose';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import NginxState from '@/models/NginxState';
import FleetLogEvent from '@/models/FleetLogEvent';
import { recordAudit } from '@/lib/fleet/audit';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:nginx');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

const DEFAULTS = {
  key: 'global',
  managed: false,
  runtimeState: 'unknown' as const,
  managedServerNames: [] as string[],
  detectedConflicts: [] as Array<{
    serverName: string;
    filePath: string;
    reason: string;
  }>,
};

const PostZ = z.object({
  managed: z.boolean(),
  managedDir: z.string().optional(),
  binaryPath: z.string().optional(),
});

async function getOrCreateState() {
  let state = await NginxState.findOne({ key: 'global' });
  if (!state) {
    state = await NginxState.create(DEFAULTS);
  }
  return state;
}

export async function GET() {
  try {
    const session = (await getSession()) as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const state = await getOrCreateState();
    return NextResponse.json({ state: state.toObject() });
  } catch (error) {
    log.error('Failed to fetch nginx state', error);
    return NextResponse.json({ error: 'Failed to fetch nginx state' }, { status: 500 });
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
    const parsed = PostZ.parse(body);

    const state = await getOrCreateState();
    state.managed = parsed.managed;
    if (parsed.managedDir !== undefined) state.managedDir = parsed.managedDir;
    if (parsed.binaryPath !== undefined) state.binaryPath = parsed.binaryPath;
    await state.save();

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'nginx.toggle_managed',
      actorUserId: session.user.username,
      service: 'nginx',
      metadata: {
        managed: parsed.managed,
        managedDir: parsed.managedDir,
        binaryPath: parsed.binaryPath,
      },
    });

    return NextResponse.json({ state: state.toObject() });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to update nginx state', error);
    return NextResponse.json({ error: 'Failed to update nginx state' }, { status: 500 });
  }
}

export const PATCH = POST;
