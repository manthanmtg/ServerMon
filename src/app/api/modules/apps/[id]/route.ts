import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';
import { enqueueAppOperation } from '@/lib/apps/application/enqueue-operation';
import {
  UpdateManagedAppSchema,
  getConfiguredPublicIp,
  updateManagedApp,
} from '@/lib/apps/service';
import {
  acceptedCompatibilityOperationResponse,
  appOperationErrorResponse,
  requestedByFromSession,
  requireAppsAdminSession,
  unauthorizedResponse,
} from '../operation-route-helpers';

export const dynamic = 'force-dynamic';

const log = createLogger('api:apps:item');

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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = UpdateManagedAppSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest(parsed.error);

    const { id } = await params;
    const app = await updateManagedApp(id, parsed.data, getConfiguredPublicIp());
    return NextResponse.json({ app });
  } catch (error: unknown) {
    if (error instanceof ZodError) return badRequest(error);
    const message = error instanceof Error ? error.message : 'Failed to update app';
    log.error('Failed to update app', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAppsAdminSession();
    if (!session) return unauthorizedResponse();

    const { id } = await params;
    const result = await enqueueAppOperation({
      appId: id,
      type: 'delete',
      requestedBy: requestedByFromSession(session),
    });
    return acceptedCompatibilityOperationResponse('deletion', result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete app';
    const operationResponse = appOperationErrorResponse(error);
    if (operationResponse) return operationResponse;
    log.error('Failed to delete app', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
