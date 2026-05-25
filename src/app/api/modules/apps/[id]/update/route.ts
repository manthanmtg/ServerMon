import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';
import { AppUpdateAlreadyRunningError, updateManagedGitApp } from '@/lib/apps/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:apps:update');

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
    const result = await updateManagedGitApp(id);
    return NextResponse.json(
      { update: result },
      { status: result.status === 'failed' ? 500 : 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update app';
    if (error instanceof AppUpdateAlreadyRunningError) {
      log.warn('App update already running', { appId: error.appId });
      return NextResponse.json({ error: message }, { status: 409 });
    }
    log.error('Failed to update app', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
