import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/db';
import { createLogger } from '@/lib/logger';
import DiskSettings from '@/models/DiskSettings';

export const dynamic = 'force-dynamic';

const log = createLogger('api:modules:disk:settings');
const SETTINGS_ID = 'disk-settings';

const updateSchema = z.object({
    unitSystem: z.enum(['binary', 'decimal']).optional(),
});

async function ensureSettings() {
    await connectDB();
    let settings = await DiskSettings.findById(SETTINGS_ID).lean();
    if (!settings) {
        settings = await DiskSettings.create({
            _id: SETTINGS_ID,
            unitSystem: 'binary',
        });
        settings = settings.toObject();
    }
    return settings;
}

export async function GET() {
    try {
        const settings = await ensureSettings();
        return NextResponse.json({ settings });
    } catch (error) {
        log.error('Failed to fetch disk settings', error);
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        await ensureSettings();
        const body = updateSchema.parse(await request.json());

        const settings = await DiskSettings.findByIdAndUpdate(
            SETTINGS_ID,
            { $set: body },
            { new: true, upsert: true }
        ).lean();

        return NextResponse.json({ settings });
    } catch (error) {
        log.error('Failed to update disk settings', error);
        const message = error instanceof Error ? error.message : 'Failed to update settings';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
