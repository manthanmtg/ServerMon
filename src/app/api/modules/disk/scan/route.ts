import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@/lib/logger';

const execAsync = promisify(exec);
const log = createLogger('api:disk:scan');

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { path = '/' } = await request.json();

    // Basic sanitization
    if (
      typeof path !== 'string' ||
      path.includes(';') ||
      path.includes('&') ||
      path.includes('|')
    ) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    // Run du with -d 1 (depth 1) and -m (MB)
    // Note: Using -k (KB) and converting might be safer for varied du versions
    // We'll use -sk to get summary of top level directories
    const cmd = `du -sk ${path}/* 2>/dev/null | sort -nr | head -n 10`;
    const { stdout } = await execAsync(cmd);

    const lines = stdout.trim().split('\n');
    const results = lines.map((line) => {
      const [size, name] = line.split('\t');
      return {
        name: name.split('/').pop() || name,
        size: parseInt(size, 10) * 1024, // Convert KB to bytes
        path: name,
      };
    });

    return NextResponse.json({ results });
  } catch (error) {
    log.error('Failed to scan directories', error);
    return NextResponse.json({ error: 'Failed to scan directories' }, { status: 500 });
  }
}
