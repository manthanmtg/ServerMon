import { z } from 'zod';
import { isObjectIdOrHexString } from 'mongoose';
import User from '@/models/User';
import { EnvironmentKeyError } from '@/lib/script-runner/environment';
import { RunQueueError } from '@/lib/script-runner/queue';
import { LinkedVariableError } from '@/lib/script-runner/variables';
import connectDB from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';

const log = createLogger('api:script-runner');

export function failure(error: string, status: number) {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function data<T>(value: T, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

export class RequestError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

export async function authorized(
  request: Request,
  action: (actor: { username: string }) => Promise<Response>
) {
  try {
    const session = await getSession();
    if (!session) return failure('Sign in to use Script Runner.', 401);
    if (
      !session.user ||
      typeof session.user !== 'object' ||
      !('role' in session.user) ||
      session.user.role !== 'admin'
    ) {
      return failure('Script Runner requires administrator access.', 403);
    }
    const site = request.headers.get('sec-fetch-site');
    if (request.method !== 'GET' && (site === 'cross-site' || site === 'same-site')) {
      return failure('Send this request from ServerMon.', 403);
    }
    const id = 'id' in session.user ? session.user.id : null;
    if (typeof id !== 'string' || !isObjectIdOrHexString(id)) {
      return failure('Script Runner requires administrator access.', 403);
    }
    await connectDB();
    const actor = await User.findOne({ _id: id, isActive: true, role: 'admin' })
      .select('username')
      .lean();
    if (!actor) return failure('Script Runner requires an active administrator.', 403);
    return await action(actor);
  } catch (error) {
    if (
      error instanceof RequestError ||
      error instanceof LinkedVariableError ||
      error instanceof RunQueueError
    )
      return failure(error.message, error.status);
    if (error instanceof EnvironmentKeyError) return failure(error.message, 503);
    if (error instanceof z.ZodError)
      return failure(error.issues[0]?.message ?? 'Invalid request.', 400);
    log.error('Script Runner request failed', {
      method: request.method,
      path: new URL(request.url).pathname,
      error: error instanceof Error ? error.name : 'UnknownError',
    });
    return failure('Script Runner could not complete the request.', 500);
  }
}

export async function body<T>(request: Request, schema: z.ZodType<T>) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    throw new RequestError('Send an application/json request.', 415);
  }
  const input: unknown = await request.json().catch(() => {
    throw new RequestError('Invalid JSON body.');
  });
  return schema.parse(input);
}

export type ById = { params: Promise<{ id: string }> };
