import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import NginxState from '@/models/NginxState';
import { nginxTest } from '@/lib/fleet/nginxProcess';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:nginx:test');

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
    const result = binary ? await nginxTest({ binary }) : await nginxTest();

    state.lastTestAt = new Date();
    state.lastTestOutput = result.stderr;
    state.lastTestSuccess = result.ok;
    await state.save();

    return NextResponse.json({ ok: result.ok, stderr: result.stderr });
  } catch (error) {
    log.error('Failed to run nginx test', error);
    return NextResponse.json({ error: 'Failed to run nginx test' }, { status: 500 });
  }
}
