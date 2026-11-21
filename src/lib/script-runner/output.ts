import type { ChildProcess } from 'node:child_process';
import { open } from 'node:fs/promises';
import { StringDecoder } from 'node:string_decoder';
import type { Readable } from 'node:stream';
import type { OutputEntry } from '@/modules/script-runner/types';

export const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const PAGE_BYTES = 192 * 1024;
const CHUNK_CHARS = 4096;

export interface ProcessResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  error?: string;
  truncated: boolean;
}

export async function captureOutput(
  child: ChildProcess,
  path: string,
  limit = MAX_OUTPUT_BYTES
): Promise<ProcessResult> {
  let error: string | undefined;
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once('error', (failure: Error) => {
      error = failure.message;
    });
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  let file: Awaited<ReturnType<typeof open>> | undefined;
  let bytes = 0;
  let truncated = false;
  let pending = Promise.resolve();

  async function drain(readable: Readable | null, stream: OutputEntry['stream']) {
    if (!readable) return;
    const decoder = new StringDecoder('utf8');
    function record(text: string) {
      pending = pending.then(async () => {
        for (let start = 0; start < text.length && !truncated; ) {
          let end = Math.min(start + CHUNK_CHARS, text.length);
          const last = text.charCodeAt(end - 1);
          if (end < text.length && last >= 0xd800 && last <= 0xdbff) end++;
          const entry: OutputEntry = {
            time: new Date().toISOString(),
            stream,
            text: text.slice(start, end),
          };
          start = end;
          const line = JSON.stringify(entry) + '\n';
          const size = Buffer.byteLength(line);
          if (!file || bytes + size > limit) {
            truncated = true;
            break;
          }
          try {
            await file.appendFile(line, 'utf8');
            bytes += size;
          } catch {
            truncated = true;
          }
        }
      });
      return pending;
    }
    try {
      for await (const chunk of readable) await record(decoder.write(chunk));
      await record(decoder.end());
    } catch {
      truncated = true;
    }
  }

  try {
    try {
      file = await open(path, 'a', 0o600);
    } catch {
      // Losing output must not block the child with full pipes.
      truncated = true;
    }
    const [result] = await Promise.all([
      closed,
      drain(child.stdout, 'stdout'),
      drain(child.stderr, 'stderr'),
    ]);
    return { ...result, error, truncated };
  } finally {
    await file?.close();
  }
}

export async function readOutput(path: string, cursor: number) {
  const file = await open(path, 'r').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!file) return { entries: [] as OutputEntry[], cursor, more: false };
  try {
    const buffer = Buffer.alloc(PAGE_BYTES);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, cursor);
    const end = buffer.subarray(0, bytesRead).lastIndexOf(10) + 1;
    const entries = buffer
      .subarray(0, end)
      .toString('utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as OutputEntry);
    return { entries, cursor: cursor + end, more: bytesRead === PAGE_BYTES && end > 0 };
  } finally {
    await file.close();
  }
}
