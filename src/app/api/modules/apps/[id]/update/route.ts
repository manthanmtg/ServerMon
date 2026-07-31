import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { enqueueAppOperation } from '@/lib/apps/application/enqueue-operation';
import { ActiveAppOperationError } from '@/lib/apps/repositories/operation-repository';
import {
  acceptedCompatibilityOperationResponse,
  requestedByFromSession,
  requireAppsAdminSession,
  unauthorizedResponse,
} from '../../operation-route-helpers';

export const dynamic = 'force-dynamic';

const log = createLogger('api:apps:update');

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAppsAdminSession();
    if (!session) return unauthorizedResponse();

    const { id } = await params;
    const result = await enqueueAppOperation({
      appId: id,
      type: 'update',
      requestedBy: requestedByFromSession(session),
    });
    return acceptedCompatibilityOperationResponse('update', result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update app';
    if (error instanceof ActiveAppOperationError) {
      log.warn('App operation already running', { appId: error.appId });
      return NextResponse.json({ error: message }, { status: 409 });
    }
    log.error('Failed to update app', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
