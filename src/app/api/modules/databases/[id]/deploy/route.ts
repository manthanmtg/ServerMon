import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';
import { deployManagedDatabase } from '@/lib/databases/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:databases:deploy');

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
    void deployManagedDatabase(id).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Failed to deploy database';
      log.error('Background database deploy failed', { error: message, id });
    });
    return NextResponse.json({ accepted: true, id }, { status: 202 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to deploy database';
    log.error('Failed to deploy database', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
