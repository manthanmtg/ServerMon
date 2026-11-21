import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/db';
import { createLogger } from '@/lib/logger';
import AppsSettings from '@/models/AppsSettings';
import { getSession } from '@/lib/session';
import { pruneAllAppReleases } from '@/lib/apps/releases';

export const dynamic = 'force-dynamic';

const log = createLogger('api:modules:apps:settings');
const SETTINGS_ID = 'apps-settings';

const updateSchema = z.object({
  releaseRetention: z.number().int().min(1).max(50).optional(),
});

async function ensureSettings() {
  await connectDB();
  let settings = await AppsSettings.findById(SETTINGS_ID).lean();
  if (!settings) {
    settings = await AppsSettings.create({
      _id: SETTINGS_ID,
      releaseRetention: 10,
    });
    settings = settings.toObject();
  }
  return settings;
}

export async function GET() {
  try {
    const session = (await getSession()) as { user: { role: string } } | null;
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const settings = await ensureSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    log.error('Failed to fetch apps settings', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = (await getSession()) as { user: { role: string } } | null;
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureSettings();
    const body = updateSchema.parse(await request.json());

    const settings = await AppsSettings.findByIdAndUpdate(
      SETTINGS_ID,
      { $set: body },
      { new: true, upsert: true }
    ).lean();

    try {
      await pruneAllAppReleases();
    } catch (error) {
      log.warn('Release pruning after settings update failed', error);
    }

    return NextResponse.json({ settings });
  } catch (error) {
    log.error('Failed to update apps settings', error);
    const message = error instanceof Error ? error.message : 'Failed to update settings';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
