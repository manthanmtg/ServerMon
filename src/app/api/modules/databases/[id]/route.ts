import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';
import {
  UpdateManagedDatabaseSchema,
  deleteManagedDatabase,
  updateManagedDatabase,
} from '@/lib/databases/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:databases:item');

async function requireAdmin() {
  const session = (await getSession()) as { user?: { role?: string } } | null;
  return Boolean(session?.user?.role === 'admin');
}

function badRequest(error: unknown) {
  const message =
    error instanceof ZodError
      ? error.issues[0]?.message || 'Invalid database payload'
      : 'Invalid database payload';
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = UpdateManagedDatabaseSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest(parsed.error);

    const { id } = await params;
    const database = await updateManagedDatabase(id, parsed.data);
    return NextResponse.json({ database });
  } catch (error: unknown) {
    if (error instanceof ZodError) return badRequest(error);
    const message = error instanceof Error ? error.message : 'Failed to update database';
    log.error('Failed to update database', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const deletion = await deleteManagedDatabase(id);
    return NextResponse.json({ deletion });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete database';
    log.error('Failed to delete database', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
