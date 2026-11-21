import { NextResponse } from 'next/server';
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

const log = createLogger('api:apps:deploy');

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAppsAdminSession();
    if (!session) return unauthorizedResponse();

    const { id } = await params;
    const result = await enqueueAppOperation({
      appId: id,
      type: 'deploy',
      requestedBy: requestedByFromSession(session),
    });
    return acceptedCompatibilityOperationResponse('deployment', result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to deploy app';
    const operationResponse = appOperationErrorResponse(error);
    if (operationResponse) return operationResponse;
    log.error('Failed to deploy app', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
