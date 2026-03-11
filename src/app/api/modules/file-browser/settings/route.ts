import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/db';
import { createLogger } from '@/lib/logger';
import FileBrowserSettings from '@/models/FileBrowserSettings';
import { defaultShortcuts, resolveBrowserPath } from '@/modules/file-browser/lib/file-browser';

export const dynamic = 'force-dynamic';

const log = createLogger('api:file-browser:settings');
const SETTINGS_ID = 'file-browser-settings';

const shortcutSchema = z.object({
    id: z.string().trim().min(1).max(40),
    label: z.string().trim().min(1).max(40),
    path: z.string().trim().min(1),
});

const updateSchema = z.object({
    shortcuts: z.array(shortcutSchema).max(12).optional(),
    defaultPath: z.string().trim().optional(),
    editorMaxBytes: z.number().int().min(32768).max(10 * 1024 * 1024).optional(),
    previewMaxBytes: z.number().int().min(32768).max(10 * 1024 * 1024).optional(),
});

async function ensureSettings() {
    await connectDB();
    let settings = await FileBrowserSettings.findById(SETTINGS_ID).lean();
    if (!settings) {
        settings = await FileBrowserSettings.create({
            _id: SETTINGS_ID,
            shortcuts: defaultShortcuts(),
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
        log.error('Failed to fetch settings', error);
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        await ensureSettings();
        const body = updateSchema.parse(await request.json());

        const update: Record<string, unknown> = {};
        if (body.shortcuts) {
            update.shortcuts = body.shortcuts.map((shortcut) => ({
                ...shortcut,
                path: resolveBrowserPath(shortcut.path),
            }));
        }
        if (body.defaultPath !== undefined) {
            update.defaultPath = body.defaultPath ? resolveBrowserPath(body.defaultPath) : '';
        }
        if (body.editorMaxBytes !== undefined) {
            update.editorMaxBytes = body.editorMaxBytes;
        }
        if (body.previewMaxBytes !== undefined) {
            update.previewMaxBytes = body.previewMaxBytes;
        }

        const settings = await FileBrowserSettings.findByIdAndUpdate(
            SETTINGS_ID,
            { $set: update },
            { new: true, upsert: true }
        ).lean();

        return NextResponse.json({ settings });
    } catch (error) {
        log.error('Failed to update settings', error);
        const message = error instanceof Error ? error.message : 'Failed to update settings';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
