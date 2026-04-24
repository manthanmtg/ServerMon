import { NextResponse } from 'next/server';
import type { Model } from 'mongoose';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import NginxState from '@/models/NginxState';
import FleetLogEvent from '@/models/FleetLogEvent';
import { nginxTest, nginxReload } from '@/lib/fleet/nginxProcess';
import { recordAudit } from '@/lib/fleet/audit';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:nginx:reload');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

export async function POST() {
  try {
    const session = (await getSession()) as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const state = await NginxState.findOne({ key: 'global' });
    if (!state || !state.managed) {
      return NextResponse.json({ error: 'Nginx is not managed by ServerMon' }, { status: 409 });
    }

    const binary = state.binaryPath;
    const testResult = binary ? await nginxTest({ binary }) : await nginxTest();
    if (!testResult.ok) {
      state.lastTestAt = new Date();
      state.lastTestOutput = testResult.stderr;
      state.lastTestSuccess = false;
      await state.save();
      return NextResponse.json({ ok: false, stderr: testResult.stderr }, { status: 409 });
    }

    const reloadResult = binary ? await nginxReload({ binary }) : await nginxReload();

    state.lastReloadAt = new Date();
    state.lastReloadSuccess = reloadResult.ok;
    await state.save();

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'nginx.reload',
      actorUserId: session.user.username,
      service: 'nginx',
      metadata: { ok: reloadResult.ok },
    });

    return NextResponse.json({ ok: reloadResult.ok, stderr: reloadResult.stderr });
  } catch (error) {
    log.error('Failed to reload nginx', error);
    return NextResponse.json({ error: 'Failed to reload nginx' }, { status: 500 });
  }
}
