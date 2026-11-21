import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';
import { performManagedDatabaseAction } from '@/lib/databases/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:databases:action');
const ActionSchema = z.object({ action: z.enum(['start', 'stop', 'restart']) });

async function requireAdmin() {
  const session = (await getSession()) as { user?: { role?: string } } | null;
  return Boolean(session?.user?.role === 'admin');
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = ActionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid database action' }, { status: 400 });
    }

    const { id } = await params;
    const database = await performManagedDatabaseAction(id, parsed.data.action);
    return NextResponse.json({ database });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to run database action';
    log.error('Failed to run database action', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
