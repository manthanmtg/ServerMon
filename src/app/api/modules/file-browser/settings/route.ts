import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import { resolveBrowserPath } from '@/modules/file-browser/lib/file-browser';
import {
    loadFileBrowserSettings,
    saveFileBrowserSettings,
} from '@/modules/file-browser/lib/settings-store';

export const dynamic = 'force-dynamic';

const log = createLogger('api:file-browser:settings');

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

export async function GET() {
    try {
        const settings = await loadFileBrowserSettings();
        return NextResponse.json({ settings });
    } catch (error) {
        log.error('Failed to fetch settings', error);
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const body = updateSchema.parse(await request.json());
        const current = await loadFileBrowserSettings();
        const settings = await saveFileBrowserSettings({
            shortcuts: body.shortcuts?.map((shortcut) => ({
                ...shortcut,
                path: resolveBrowserPath(shortcut.path),
            })) || current.shortcuts,
            defaultPath: body.defaultPath !== undefined
                ? (body.defaultPath ? resolveBrowserPath(body.defaultPath) : '/')
                : current.defaultPath,
            editorMaxBytes: body.editorMaxBytes ?? current.editorMaxBytes,
            previewMaxBytes: body.previewMaxBytes ?? current.previewMaxBytes,
        });

        return NextResponse.json({ settings });
    } catch (error) {
        log.error('Failed to update settings', error);
        const message = error instanceof Error ? error.message : 'Failed to update settings';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
