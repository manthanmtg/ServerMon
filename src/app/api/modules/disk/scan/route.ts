import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'util';
import path from 'node:path';
import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';

const execFileAsync = promisify(execFile);
const log = createLogger('api:disk:scan');

export const dynamic = 'force-dynamic';

const ScanBodySchema = z.object({
  path: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .default('/')
    .transform((rawPath) => path.posix.normalize(rawPath).replace(/\/{2,}/g, '/')),
});

function isSafeDiskPath(candidate: string): boolean {
  if (candidate === '/') {
    return true;
  }

  return /^\/(?:[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)$/.test(candidate);
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = ScanBodySchema.safeParse(await request.json());
    if (!result.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const scanPath = result.data.path;
    if (!isSafeDiskPath(scanPath)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const { stdout } = await execFileAsync('du', ['-sk', '--max-depth=1', scanPath]);

    const results = stdout
      .trim()
      .split('\n')
      .map((line) => {
        const [sizeText, entryPath] = line.split('\t');
        if (!sizeText || !entryPath || entryPath === scanPath) {
          return null;
        }
        const size = Number.parseInt(sizeText, 10);
        if (Number.isNaN(size) || size < 0) {
          return null;
        }
        const name = entryPath.split('/').pop() || entryPath;
        return {
          name,
          size: size * 1024,
          path: entryPath,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort((a, b) => b.size - a.size)
      .slice(0, 10);

    return NextResponse.json({ results });
  } catch (error) {
    log.error('Failed to scan directories', error);
    return NextResponse.json({ error: 'Failed to scan directories' }, { status: 500 });
  }
}
