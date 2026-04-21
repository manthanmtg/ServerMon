import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { FileBrowserError, writeUpload } from '@/modules/file-browser/lib/file-browser';

export const dynamic = 'force-dynamic';

const log = createLogger('api:file-browser:upload');

function toErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  const status = error instanceof FileBrowserError ? error.status : 500;
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let targetPath = '';
  let fileSummaries: Array<{ name: string; size: number; type: string }> = [];

  try {
    const formData = await request.formData();
    targetPath = String(formData.get('path') || '');
    const files = formData.getAll('files').filter((value): value is File => value instanceof File);
    fileSummaries = files.map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type || 'unknown',
    }));

    if (!targetPath) {
      return NextResponse.json({ error: 'Target path is required' }, { status: 400 });
    }
    if (files.length === 0) {
      return NextResponse.json({ error: 'At least one file is required' }, { status: 400 });
    }

    log.info('File upload started', {
      targetPath,
      fileCount: files.length,
      files: fileSummaries,
    });

    const uploadedPaths = await Promise.all(
      files.map(async (file) => {
        if (!file.stream) {
          throw new FileBrowserError(`Upload stream unavailable for ${file.name}`, 400);
        }
        return writeUpload(targetPath, file.name, file.stream());
      })
    );

    log.info('File upload completed', {
      targetPath,
      fileCount: files.length,
      durationMs: Date.now() - startedAt,
      uploadedPaths,
    });

    return NextResponse.json({ uploadedPaths }, { status: 201 });
  } catch (error) {
    log.error('Failed to upload files', {
      targetPath,
      fileCount: fileSummaries.length,
      files: fileSummaries,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'Unexpected error',
    });
    return toErrorResponse(error);
  }
}
