import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import TerminalSettings from '@/models/TerminalSettings';
import { createLogger } from '@/lib/logger';

import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
const log = createLogger('api:terminal:settings');

const SETTINGS_ID = 'terminal-settings';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    let settings = await TerminalSettings.findById(SETTINGS_ID).lean();
    if (!settings) {
      settings = await TerminalSettings.create({ _id: SETTINGS_ID });
      settings = settings.toObject();
    }
    return NextResponse.json({ settings });
  } catch (error) {
    log.error('Failed to fetch settings', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = (await getSession()) as { user?: { role?: string } } | null;
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    await connectDB();
    const body = await request.json();

    const update: Record<string, unknown> = {};
    if (body.idleTimeoutMinutes !== undefined) {
      update.idleTimeoutMinutes = Math.max(1, Math.min(1440, Number(body.idleTimeoutMinutes)));
    }
    if (body.maxSessions !== undefined) {
      update.maxSessions = Math.max(1, Math.min(20, Number(body.maxSessions)));
    }
    if (body.fontSize !== undefined) {
      update.fontSize = Math.max(10, Math.min(24, Number(body.fontSize)));
    }
    if (body.loginAsUser !== undefined) {
      update.loginAsUser = String(body.loginAsUser).trim();
    }
    if (body.defaultDirectory !== undefined) {
      update.defaultDirectory = String(body.defaultDirectory).trim();
    }

    const settings = await TerminalSettings.findByIdAndUpdate(
      SETTINGS_ID,
      { $set: update },
      { new: true, upsert: true }
    ).lean();

    return NextResponse.json({ settings });
  } catch (error) {
    log.error('Failed to update settings', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
