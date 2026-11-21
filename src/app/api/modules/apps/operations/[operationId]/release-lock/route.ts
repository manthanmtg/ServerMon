import { z } from 'zod';
import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import {
  findAppOperationById,
  releaseAppOperationLock,
} from '@/lib/apps/repositories/operation-repository';
import {
  badRequestResponse,
  notFoundResponse,
  requireAppsAdminSession,
  serverErrorResponse,
  unauthorizedResponse,
} from '../../../operation-route-helpers';

export const dynamic = 'force-dynamic';

const log = createLogger('api:apps:operation-release-lock');

const ReleaseLockSchema = z.object({ confirm: z.literal(true) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ operationId: string }> }
) {
  try {
    const session = await requireAppsAdminSession();
    if (!session) return unauthorizedResponse();

    const { operationId } = await params;
    const body: unknown = await request.json().catch(() => null);
    const parsed = ReleaseLockSchema.safeParse(body);
    if (!parsed.success) {
      return badRequestResponse('Confirmation is required to release an app operation lock');
    }

    const existing = await findAppOperationById(operationId);
    if (!existing) return notFoundResponse('Operation not found');

    const released = await releaseAppOperationLock({
      operationId,
      reason: `Lock released by administrator ${session.user?.username ?? session.user?.id ?? 'unknown'} after recovery verification`,
      releasedBy: 'admin',
    });
    if (!released) {
      return NextResponse.json(
        { error: 'Operation lock is not in the recovery-required state' },
        { status: 409 }
      );
    }
    return Response.json({ data: { operation: released } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to release app operation lock';
    log.error('Failed to release app operation lock', { error: message });
    return serverErrorResponse(message);
  }
}
