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
  try {
    const formData = await request.formData();
    const targetPath = String(formData.get('path') || '');
    const files = formData.getAll('files').filter((value): value is File => value instanceof File);

    if (!targetPath) {
      return NextResponse.json({ error: 'Target path is required' }, { status: 400 });
    }
    if (files.length === 0) {
      return NextResponse.json({ error: 'At least one file is required' }, { status: 400 });
    }

    const uploadedPaths = await Promise.all(
      files.map(async (file) => {
        if (!file.stream) {
          throw new FileBrowserError(`Upload stream unavailable for ${file.name}`, 400);
        }
        return writeUpload(targetPath, file.name, file.stream());
      })
    );

    return NextResponse.json({ uploadedPaths }, { status: 201 });
  } catch (error) {
    log.error('Failed to upload files', error);
    return toErrorResponse(error);
  }
}
