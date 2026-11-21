import { opendir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { directoryInput } from '@/lib/script-runner/schemas';
import { supported } from '@/lib/script-runner/store';
import { authorized, data, failure } from '../_shared';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return authorized(request, async () => {
    if (!supported) return failure('Directory browsing requires a Linux host.', 503);
    const path = directoryInput.parse(new URL(request.url).searchParams.get('path') ?? '/');
    const base = await realpath(path).catch(() => null);
    const listing = base ? await opendir(base).catch(() => null) : null;
    if (!base || !listing) return failure('This directory is unavailable.', 422);
    const directories: string[] = [];
    for await (const entry of listing) {
      if (entry.isDirectory() && !entry.name.startsWith('.'))
        directories.push(join(base, entry.name));
      if (directories.length >= 150) break;
    }
    return data({ path: base, directories: directories.sort((a, b) => a.localeCompare(b)) });
  });
}
