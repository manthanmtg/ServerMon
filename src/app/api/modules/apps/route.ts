import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';
import {
  CreateManagedAppSchema,
  createManagedApp,
  getConfiguredPublicIp,
  listManagedApps,
} from '@/lib/apps/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:apps');

async function requireAdmin() {
  const session = (await getSession()) as { user?: { role?: string } } | null;
  return Boolean(session?.user?.role === 'admin');
}

function badRequest(error: unknown) {
  const message =
    error instanceof ZodError
      ? error.issues[0]?.message || 'Invalid app payload'
      : 'Invalid app payload';
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET() {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apps = await listManagedApps(getConfiguredPublicIp());
    return NextResponse.json({ apps });
  } catch (error: unknown) {
    log.error('Failed to list apps', error);
    return NextResponse.json({ error: 'Failed to list apps' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = CreateManagedAppSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest(parsed.error);

    const app = await createManagedApp(parsed.data, getConfiguredPublicIp());
    return NextResponse.json({ app }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ZodError) return badRequest(error);
    const message = error instanceof Error ? error.message : 'Failed to create app';
    log.error('Failed to create app', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
