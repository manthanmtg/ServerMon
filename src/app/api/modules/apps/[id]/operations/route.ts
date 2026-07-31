import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { createLogger } from '@/lib/logger';
import { enqueueAppOperation } from '@/lib/apps/application/enqueue-operation';
import { ActiveAppOperationError } from '@/lib/apps/repositories/operation-repository';
import {
  badRequestResponse,
  requireAppsAdminSession,
  serverErrorResponse,
  unauthorizedResponse,
} from '../../operation-route-helpers';

export const dynamic = 'force-dynamic';

const log = createLogger('api:apps:operations');
const EnqueueOperationSchema = z.object({
  type: z.enum(['deploy', 'update', 'rollback', 'delete']),
  targetReleaseId: z.string().trim().min(1).optional(),
});

function zodMessage(error: ZodError): string {
  return error.issues[0]?.message ?? 'Invalid operation payload';
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAppsAdminSession();
    if (!session) return unauthorizedResponse();

    const parsed = EnqueueOperationSchema.safeParse(await request.json());
    if (!parsed.success) return badRequestResponse(zodMessage(parsed.error));

    const { id } = await params;
    const result = await enqueueAppOperation({
      appId: id,
      type: parsed.data.type,
      targetReleaseId: parsed.data.targetReleaseId,
      idempotencyKey: request.headers.get('Idempotency-Key')?.trim() || undefined,
      requestedBy: {
        userId: session.user?.id,
        username: session.user?.username,
        role: session.user?.role,
      },
    });

    return NextResponse.json(
      { data: result },
      { status: 202, headers: { Location: result.links.self } }
    );
  } catch (error: unknown) {
    if (error instanceof ZodError) return badRequestResponse(zodMessage(error));
    const message = error instanceof Error ? error.message : 'Failed to enqueue app operation';
    if (error instanceof ActiveAppOperationError) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    log.error('Failed to enqueue app operation', { error: message });
    return serverErrorResponse(message);
  }
}
