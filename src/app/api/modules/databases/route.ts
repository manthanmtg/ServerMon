import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';
import {
  CreateManagedDatabaseSchema,
  createManagedDatabase,
  listManagedDatabases,
} from '@/lib/databases/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:databases');

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

export async function GET() {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const databases = await listManagedDatabases();
    return NextResponse.json({ databases });
  } catch (error: unknown) {
    log.error('Failed to list databases', error);
    return NextResponse.json({ error: 'Failed to list databases' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = CreateManagedDatabaseSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest(parsed.error);

    const database = await createManagedDatabase(parsed.data);
    return NextResponse.json({ database }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ZodError) return badRequest(error);
    const message = error instanceof Error ? error.message : 'Failed to create database';
    log.error('Failed to create database', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
