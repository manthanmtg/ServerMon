import { NextResponse } from 'next/server';
import { ZodError, z } from 'zod';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';
import {
  getAutoUpdateScheduleState,
  loadAutoUpdateSettings,
  saveAutoUpdateSettings,
} from '@/lib/updates/auto-update';

export const dynamic = 'force-dynamic';

const log = createLogger('api:system:update:auto');

const PatchZ = z.object({
  enabled: z.boolean(),
  time: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().min(1).refine(isValidTimezone, 'Invalid timezone'),
});

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const settings = await loadAutoUpdateSettings();
    const schedule = getAutoUpdateScheduleState(settings);
    return NextResponse.json({ settings, schedule });
  } catch (error) {
    log.error('Failed to fetch local auto-update settings', error);
    return NextResponse.json(
      { error: 'Failed to fetch local auto-update settings' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = PatchZ.parse(await request.json());
    const settings = await saveAutoUpdateSettings(parsed);
    const schedule = getAutoUpdateScheduleState(settings);
    return NextResponse.json({ settings, schedule });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to save local auto-update settings', error);
    return NextResponse.json(
      { error: 'Failed to save local auto-update settings' },
      { status: 500 }
    );
  }
}

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
