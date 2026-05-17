import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { createLogger } from '@/lib/logger';
import { rollbackManagedApp } from '@/lib/apps/service';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:apps:rollback');
const RollbackSchema = z.object({
  releaseId: z.string().trim().min(1),
});

async function requireAdmin() {
  const session = (await getSession()) as { user?: { role?: string } } | null;
  return Boolean(session?.user?.role === 'admin');
}

function badRequest(error: unknown) {
  const message =
    error instanceof ZodError
      ? error.issues[0]?.message || 'Invalid rollback payload'
      : 'Invalid rollback payload';
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = RollbackSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest(parsed.error);

    const { id } = await params;
    const result = await rollbackManagedApp(id, parsed.data.releaseId);
    return NextResponse.json(
      { rollback: result },
      { status: result.status === 'active' ? 200 : 500 }
    );
  } catch (error: unknown) {
    if (error instanceof ZodError) return badRequest(error);
    const message = error instanceof Error ? error.message : 'Failed to roll back app';
    log.error('Failed to roll back app', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
