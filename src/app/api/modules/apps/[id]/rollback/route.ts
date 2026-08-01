import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { createLogger } from '@/lib/logger';
import { enqueueAppOperation } from '@/lib/apps/application/enqueue-operation';
import {
  acceptedCompatibilityOperationResponse,
  appOperationErrorResponse,
  requestedByFromSession,
  requireAppsAdminSession,
  unauthorizedResponse,
} from '../../operation-route-helpers';

export const dynamic = 'force-dynamic';

const log = createLogger('api:apps:rollback');
const RollbackSchema = z.object({
  releaseId: z.string().trim().min(1),
});

function badRequest(error: unknown) {
  const message =
    error instanceof ZodError
      ? error.issues[0]?.message || 'Invalid rollback payload'
      : 'Invalid rollback payload';
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAppsAdminSession();
    if (!session) return unauthorizedResponse();

    const parsed = RollbackSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest(parsed.error);

    const { id } = await params;
    const result = await enqueueAppOperation({
      appId: id,
      type: 'rollback',
      targetReleaseId: parsed.data.releaseId,
      requestedBy: requestedByFromSession(session),
    });
    return acceptedCompatibilityOperationResponse('rollback', result);
  } catch (error: unknown) {
    if (error instanceof ZodError) return badRequest(error);
    const message = error instanceof Error ? error.message : 'Failed to roll back app';
    const operationResponse = appOperationErrorResponse(error);
    if (operationResponse) return operationResponse;
    log.error('Failed to roll back app', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
