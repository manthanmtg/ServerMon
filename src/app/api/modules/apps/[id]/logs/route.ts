import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getManagedAppLogsById } from '@/lib/apps/service';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:apps:logs');

async function requireAdmin() {
  const session = (await getSession()) as { user?: { role?: string } } | null;
  return Boolean(session?.user?.role === 'admin');
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const url = new URL(request.url);
    const lines = Math.min(Math.max(Number(url.searchParams.get('lines')) || 200, 1), 500);
    const logs = await getManagedAppLogsById(id, lines);
    return NextResponse.json({ logs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch app logs';
    log.error('Failed to fetch app logs', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
