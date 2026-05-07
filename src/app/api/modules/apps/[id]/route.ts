import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';
import { deleteManagedApp } from '@/lib/apps/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:apps:item');

async function requireAdmin() {
  const session = (await getSession()) as { user?: { role?: string } } | null;
  return Boolean(session?.user?.role === 'admin');
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const result = await deleteManagedApp(id);
    return NextResponse.json({ deletion: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete app';
    log.error('Failed to delete app', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
