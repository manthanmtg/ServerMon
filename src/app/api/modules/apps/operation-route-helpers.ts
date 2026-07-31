import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import type { EnqueuedAppOperationResponse } from '@/modules/apps/types';

export interface AppsAdminSession {
  user?: {
    id?: string;
    username?: string;
    role?: string;
  };
}

export async function requireAppsAdminSession(): Promise<AppsAdminSession | null> {
  const session = (await getSession()) as AppsAdminSession | null;
  return session?.user?.role === 'admin' ? session : null;
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function badRequestResponse(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFoundResponse(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function serverErrorResponse(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

export function requestedByFromSession(session: AppsAdminSession) {
  return {
    userId: session.user?.id,
    username: session.user?.username,
    role: session.user?.role,
  };
}

export function acceptedCompatibilityOperationResponse(
  key: 'deployment' | 'update' | 'rollback' | 'deletion',
  result: EnqueuedAppOperationResponse
) {
  return NextResponse.json(
    {
      [key]: {
        operationId: result.operation.id,
        status: result.operation.status,
        phase: result.operation.phase,
      },
    },
    { status: 202, headers: { Location: result.links.self } }
  );
}
