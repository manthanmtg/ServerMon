import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  AIRunnerPromptAttachmentDTO,
  AIRunnerPromptAttachmentRefDTO,
} from '@/modules/ai-runner/types';

export const MAX_PROMPT_ATTACHMENTS = 8;
export const MAX_PROMPT_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_PROMPT_ATTACHMENTS_TOTAL_BYTES = 10 * 1024 * 1024;
export const PROMPT_ATTACHMENT_TMP_DIR = join(tmpdir(), 'servermon-ai-runner-attachments');

export interface StoredPromptAttachment {
  name: string;
  contentType: string;
  size: number;
  data: Buffer;
}

export function sanitizeAttachmentName(name: string): string {
  const fallback = 'attachment';
  const base = basename(name.trim() || fallback)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || fallback;
}

export function appendAttachmentReferencesToPrompt(prompt: string, paths: string[]): string {
  if (paths.length === 0) return prompt;

  return [
    prompt.trimEnd(),
    '',
    'Refer images/files in below paths:',
    ...paths.map((path) => `- ${path}`),
  ].join('\n');
}

export async function materializePromptAttachments(
  attachments: StoredPromptAttachment[],
  options: { baseDir?: string; prefix?: string } = {}
): Promise<string[]> {
  if (attachments.length === 0) return [];

  const targetDir = options.baseDir ?? PROMPT_ATTACHMENT_TMP_DIR;
  await mkdir(targetDir, { recursive: true });
  const prefix = sanitizeAttachmentName(options.prefix ?? randomUUID());

  const paths: string[] = [];
  for (const attachment of attachments) {
    const fileName = `${prefix}-${randomUUID()}-${sanitizeAttachmentName(attachment.name)}`;
    const path = join(targetDir, fileName);
    await writeFile(path, attachment.data);
    paths.push(path);
  }

  return paths;
}

export function decodeStoredPromptAttachments(
  attachments: AIRunnerPromptAttachmentDTO[] = []
): StoredPromptAttachment[] {
  return attachments.map((attachment) => ({
    name: sanitizeAttachmentName(attachment.name),
    contentType: attachment.contentType || 'application/octet-stream',
    size: attachment.size,
    data: Buffer.from(attachment.data, 'base64'),
  }));
}

export function encodeStoredPromptAttachment(
  attachment: StoredPromptAttachment | Record<string, unknown>
): AIRunnerPromptAttachmentDTO {
  const data = attachment.data;
  const buffer = Buffer.isBuffer(data)
    ? data
    : data instanceof Uint8Array
      ? Buffer.from(data)
      : Buffer.from([]);

  return {
    name: String(attachment.name),
    contentType: attachment.contentType
      ? String(attachment.contentType)
      : 'application/octet-stream',
    size: typeof attachment.size === 'number' ? attachment.size : buffer.byteLength,
    data: buffer.toString('base64'),
  };
}

export function normalizeAttachmentRefs(
  attachments: AIRunnerPromptAttachmentRefDTO[] = []
): AIRunnerPromptAttachmentRefDTO[] {
  return attachments.map((attachment) => ({
    name: sanitizeAttachmentName(attachment.name),
    path: attachment.path,
    contentType: attachment.contentType || 'application/octet-stream',
    size: attachment.size,
  }));
}
