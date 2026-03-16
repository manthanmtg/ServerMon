import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import QuickAccessSettings from '@/models/QuickAccessSettings';
import { getSession } from '@/lib/session';
import { createLogger } from '@/lib/logger';
import { z } from 'zod';

const log = createLogger('api:settings:quick-access');

export const dynamic = 'force-dynamic';

const QuickAccessItemSchema = z.object({
  id: z.string().min(1).max(64),
  href: z.string().min(1).max(128),
  label: z.string().min(1).max(64),
  icon: z.string().min(1).max(64),
});

const PutBodySchema = z.object({
  items: z.array(QuickAccessItemSchema).max(20),
});

export async function GET() {
  try {
    await connectDB();
    const settings = await QuickAccessSettings.findById('quick-access-settings').lean();
    const items = (settings as { items?: unknown[] } | null)?.items ?? [];
    return NextResponse.json({ items });
  } catch (err: unknown) {
    log.error('Failed to fetch quick access settings', err);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = (await getSession()) as { user: { role: string } } | null;
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = PutBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    await connectDB();
    await QuickAccessSettings.findOneAndUpdate(
      { _id: 'quick-access-settings' },
      { $set: { items: parsed.data.items, updatedAt: new Date() } },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true, items: parsed.data.items });
  } catch (err: unknown) {
    log.error('Failed to update quick access settings', err);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
