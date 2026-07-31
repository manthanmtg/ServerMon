import { createLogger } from '@/lib/logger';
import { listAppOperationEvents } from '@/lib/apps/repositories/operation-event-repository';
import {
  requireAppsAdminSession,
  serverErrorResponse,
  unauthorizedResponse,
} from '../../../operation-route-helpers';

export const dynamic = 'force-dynamic';

const log = createLogger('api:apps:operation-events');

function numberParam(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ operationId: string }> }
) {
  try {
    if (!(await requireAppsAdminSession())) return unauthorizedResponse();

    const { operationId } = await params;
    const url = new URL(request.url);
    const events = await listAppOperationEvents(operationId, {
      afterSequence: numberParam(url.searchParams.get('after'), 0),
      limit: numberParam(url.searchParams.get('limit'), 100),
    });
    return Response.json({ data: { events } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load app operation events';
    log.error('Failed to load app operation events', { error: message });
    return serverErrorResponse(message);
  }
}
