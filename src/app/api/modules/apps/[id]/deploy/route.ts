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
    if (error instanceof ActiveAppOperationError) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    log.error('Failed to deploy app', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
