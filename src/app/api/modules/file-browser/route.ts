import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import {
    createEntry,
    deleteEntry,
    FileBrowserError,
    listDirectory,
    readTree,
    renameEntry,
    resolveBrowserPath,
} from '@/modules/file-browser/lib/file-browser';

export const dynamic = 'force-dynamic';

const log = createLogger('api:file-browser');

const createSchema = z.object({
    parentPath: z.string().trim().min(1),
    name: z.string().trim().min(1).max(255),
    kind: z.enum(['file', 'directory']),
    content: z.string().optional(),
});

const renameSchema = z.object({
    path: z.string().trim().min(1),
    name: z.string().trim().min(1).max(255),
});

const deleteSchema = z.object({
    path: z.string().trim().min(1),
});

function toErrorResponse(error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    const status = error instanceof FileBrowserError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const targetPath = resolveBrowserPath(searchParams.get('path') || '/');
        const mode = searchParams.get('mode') || 'list';

        if (mode === 'tree') {
            const depth = Math.min(Number(searchParams.get('depth') || '2'), 4);
            const tree = await readTree(targetPath, depth);
            return NextResponse.json({ tree });
        }

        const listing = await listDirectory(targetPath);
        return NextResponse.json({ listing });
    } catch (error) {
        log.error('Failed to fetch directory view', error);
        return toErrorResponse(error);
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = createSchema.parse(await request.json());
        const createdPath = await createEntry(body.parentPath, body.name, body.kind, body.content || '');
        return NextResponse.json({ path: createdPath }, { status: 201 });
    } catch (error) {
        log.error('Failed to create entry', error);
        return toErrorResponse(error);
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const body = renameSchema.parse(await request.json());
        const nextPath = await renameEntry(body.path, body.name);
        return NextResponse.json({ path: nextPath });
    } catch (error) {
        log.error('Failed to rename entry', error);
        return toErrorResponse(error);
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const body = deleteSchema.parse(await request.json());
        await deleteEntry(body.path);
        return NextResponse.json({ success: true });
    } catch (error) {
        log.error('Failed to delete entry', error);
        return toErrorResponse(error);
    }
}
