import { createLogger } from '@/lib/logger';
import { findAppOperationById } from '@/lib/apps/repositories/operation-repository';
import {
  notFoundResponse,
  requireAppsAdminSession,
  serverErrorResponse,
  unauthorizedResponse,
} from '../../operation-route-helpers';

export const dynamic = 'force-dynamic';

const log = createLogger('api:apps:operation-detail');

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ operationId: string }> }
) {
  try {
    if (!(await requireAppsAdminSession())) return unauthorizedResponse();

    const { operationId } = await params;
    const operation = await findAppOperationById(operationId);
    if (!operation) return notFoundResponse('Operation not found');
    return Response.json({ data: { operation } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load app operation';
    log.error('Failed to load app operation', { error: message });
    return serverErrorResponse(message);
  }
}
