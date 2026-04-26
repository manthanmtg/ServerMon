import { NextResponse } from 'next/server';
import { z } from 'zod';
import { envVarsService } from '@/lib/env-vars/service';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const log = createLogger('api:env-vars');

const mutationSchema = z.object({
  key: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  value: z.string().optional(),
  scope: z.enum(['user', 'system']),
});

async function requireAdmin() {
  const session = (await getSession()) as { user: { role: string } } | null;
  return Boolean(session && session.user.role === 'admin');
}

function validationError() {
  return NextResponse.json({ error: 'Invalid environment variable name' }, { status: 400 });
}

export async function GET() {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const snapshot = await envVarsService.getSnapshot();
    return NextResponse.json(snapshot);
  } catch (error: unknown) {
    log.error('Failed to fetch environment variables', error);
    return NextResponse.json({ error: 'Failed to fetch environment variables' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = mutationSchema.safeParse(await request.json());
    if (!parsed.success) return validationError();

    const result = await envVarsService.addEnvVar(parsed.data);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to add environment variable';
    log.error('Failed to add environment variable', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = mutationSchema.omit({ value: true }).safeParse(await request.json());
    if (!parsed.success) return validationError();

    const result = await envVarsService.deleteEnvVar(parsed.data);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to delete environment variable';
    log.error('Failed to delete environment variable', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
