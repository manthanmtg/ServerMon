import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import TerminalSettings from '@/models/TerminalSettings';
import { createLogger } from '@/lib/logger';
import { z } from 'zod';

import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
const log = createLogger('api:terminal:settings');

const settingsSchema = z.object({
  idleTimeoutMinutes: z.preprocess(
    (value) => (typeof value === 'string' || typeof value === 'number' ? Number(value) : value),
    z.number().int().min(1).max(1440).optional(),
  ),
  maxSessions: z.preprocess(
    (value) => (typeof value === 'string' || typeof value === 'number' ? Number(value) : value),
    z.number().int().min(1).max(20).optional(),
  ),
  fontSize: z.preprocess(
    (value) => (typeof value === 'string' || typeof value === 'number' ? Number(value) : value),
    z.number().int().min(10).max(24).optional(),
  ),
  loginAsUser: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z.string().max(128).optional(),
  ),
  defaultDirectory: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z.string().max(1024).optional(),
  ),
});

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
    const parsedBody = settingsSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      log.warn('Invalid terminal settings payload', parsedBody.error.flatten());
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const body = parsedBody.data;

    const update: Record<string, number | string> = {};
    if (body.idleTimeoutMinutes !== undefined) {
      update.idleTimeoutMinutes = body.idleTimeoutMinutes;
    }
    if (body.maxSessions !== undefined) {
      update.maxSessions = body.maxSessions;
    }
    if (body.fontSize !== undefined) {
      update.fontSize = body.fontSize;
    }
    if (body.loginAsUser !== undefined) {
      update.loginAsUser = body.loginAsUser;
    }
    if (body.defaultDirectory !== undefined) {
      update.defaultDirectory = body.defaultDirectory;
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
