import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import {
  MAX_PROMPT_ATTACHMENT_BYTES,
  MAX_PROMPT_ATTACHMENTS,
  MAX_PROMPT_ATTACHMENTS_TOTAL_BYTES,
  PROMPT_ATTACHMENT_TMP_DIR,
  sanitizeAttachmentName,
} from '@/lib/ai-runner/attachments';
import { requireSession } from '../../_shared';
import type { AIRunnerPromptAttachmentRefDTO } from '@/modules/ai-runner/types';

export const dynamic = 'force-dynamic';

const log = createLogger('api:ai-runner:prompt-attachments:temp');

export async function POST(request: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const formData = await request.formData();
    const files = formData.getAll('files').filter((value): value is File => value instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }
    if (files.length > MAX_PROMPT_ATTACHMENTS) {
      return NextResponse.json(
        { error: `Upload up to ${MAX_PROMPT_ATTACHMENTS} files at a time` },
        { status: 400 }
      );
    }

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (
      files.some((file) => file.size > MAX_PROMPT_ATTACHMENT_BYTES) ||
      totalSize > MAX_PROMPT_ATTACHMENTS_TOTAL_BYTES
    ) {
      return NextResponse.json(
        { error: 'Prompt attachments can be at most 5 MB each and 10 MB total' },
        { status: 400 }
      );
    }

    await mkdir(PROMPT_ATTACHMENT_TMP_DIR, { recursive: true });
    const attachments: AIRunnerPromptAttachmentRefDTO[] = [];

    for (const file of files) {
      const name = sanitizeAttachmentName(file.name);
      const path = join(PROMPT_ATTACHMENT_TMP_DIR, `${randomUUID()}-${name}`);
      await writeFile(path, Buffer.from(await file.arrayBuffer()));
      attachments.push({
        name,
        path,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
      });
    }

    return NextResponse.json({ attachments }, { status: 201 });
  } catch (error) {
    log.error('Failed to upload temporary AI runner prompt attachments', error);
    return NextResponse.json({ error: 'Failed to upload attachments' }, { status: 500 });
  }
}
