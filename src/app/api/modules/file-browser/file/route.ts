import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import FileBrowserSettings from '@/models/FileBrowserSettings';
import {
    createDownloadStream,
    FileBrowserError,
    previewFile,
    readEditableFile,
    resolveBrowserPath,
    saveFile,
} from '@/modules/file-browser/lib/file-browser';

export const dynamic = 'force-dynamic';

const log = createLogger('api:file-browser:file');
const SETTINGS_ID = 'file-browser-settings';

const updateSchema = z.object({
    path: z.string().trim().min(1),
    content: z.string(),
});

async function getLimits() {
    try {
        await connectDB();
        const settings = await FileBrowserSettings.findById(SETTINGS_ID).lean();
        return {
            previewMaxBytes: settings?.previewMaxBytes || 512 * 1024,
            editorMaxBytes: settings?.editorMaxBytes || 1024 * 1024,
        };
    } catch {
        return {
            previewMaxBytes: 512 * 1024,
            editorMaxBytes: 1024 * 1024,
        };
    }
}

function toErrorResponse(error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    const status = error instanceof FileBrowserError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const targetPath = resolveBrowserPath(searchParams.get('path') || '');
        const action = searchParams.get('action') || 'preview';
        const limits = await getLimits();

        if (action === 'download') {
            const { stream, fileName, mimeType } = await createDownloadStream(targetPath);
            return new NextResponse(stream, {
                headers: {
                    'Content-Type': mimeType,
                    'Content-Disposition': `attachment; filename="${fileName}"`,
                },
            });
        }

        if (action === 'edit') {
            const file = await readEditableFile(targetPath, limits.editorMaxBytes);
            return NextResponse.json({ file });
        }

        const file = await previewFile(targetPath, limits.previewMaxBytes);
        return NextResponse.json({ file });
    } catch (error) {
        log.error('Failed to fetch file', error);
        return toErrorResponse(error);
    }
}

export async function PUT(request: NextRequest) {
    try {
        const body = updateSchema.parse(await request.json());
        await saveFile(body.path, body.content);
        return NextResponse.json({ success: true });
    } catch (error) {
        log.error('Failed to save file', error);
        return toErrorResponse(error);
    }
}
