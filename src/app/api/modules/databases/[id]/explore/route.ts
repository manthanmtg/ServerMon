import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';
import { startManagedDatabaseExplorer, stopManagedDatabaseExplorer } from '@/lib/databases/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:databases:explore');

async function requireAdmin() {
  const session = (await getSession()) as { user?: { role?: string } } | null;
  return Boolean(session?.user?.role === 'admin');
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const explorer = await startManagedDatabaseExplorer(id);
    return NextResponse.json({ explorer });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to start database explorer';
    log.error('Failed to start database explorer', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const explorer = await stopManagedDatabaseExplorer(id);
    return NextResponse.json({ explorer });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to stop database explorer';
    log.error('Failed to stop database explorer', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
