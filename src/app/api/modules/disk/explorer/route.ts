import path from 'node:path';
import { isObjectIdOrHexString } from 'mongoose';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';
import User from '@/models/User';
import { DiskCleanupError } from '@/modules/disk/lib/cleanup';
import {
  confirmDiskDeletion,
  DiskExplorerError,
  getDiskScan,
  requestDiskDeletion,
  startDiskScan,
} from '@/modules/disk/lib/explorer';

export const dynamic = 'force-dynamic';

const log = createLogger('api:disk:explorer');
const actorSchema = z.object({ user: z.object({ id: z.string().min(1), role: z.string() }) });
const absolutePath = z
  .string()
  .min(1)
  .max(4096)
  .refine((value) => path.isAbsolute(value) && !value.includes('\0'), 'Use an absolute path.')
  .transform((value) => path.resolve(value));
const scanId = z.uuid();
const startSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('scan'), path: absolutePath }),
  z.object({ action: z.literal('prepare-delete'), id: scanId, path: absolutePath }),
]);
const browseSchema = z.object({
  id: scanId,
  offset: z.coerce.number().int().nonnegative().safe().default(0),
});
const deleteSchema = z.object({ id: scanId, token: z.uuid() });

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function failure(error: string, status: number) {
  return json({ error }, status);
}

async function actor() {
  const result = actorSchema.safeParse(await getSession());
  return result.success ? result.data.user : null;
}

async function requireActiveAdmin(
  user: NonNullable<Awaited<ReturnType<typeof actor>>>,
  request: Request
) {
  const site = request.headers.get('sec-fetch-site');
  if (site === 'cross-site' || site === 'same-site') {
    throw new DiskExplorerError('Send this request from ServerMon.', 403);
  }
  if (user.role !== 'admin' || !isObjectIdOrHexString(user.id)) {
    throw new DiskExplorerError('Administrator access is required.', 403);
  }
  await connectDB();
  if (!(await User.exists({ _id: user.id, isActive: true, role: 'admin' }))) {
    throw new DiskExplorerError('An active administrator account is required.', 403);
  }
}

function routeError(error: unknown) {
  if (error instanceof DiskExplorerError || error instanceof DiskCleanupError) {
    return failure(error.message, error.status);
  }
  log.error('Disk explorer request failed', error);
  return failure('Disk explorer request failed.', 500);
}

export async function GET(request: Request) {
  try {
    const user = await actor();
    if (!user) return failure('Unauthorized', 401);

    const params = new URL(request.url).searchParams;
    const query = browseSchema.safeParse(Object.fromEntries(params));
    if (!query.success) return failure('Invalid scan or directory.', 400);

    const { id, offset } = query.data;
    return json(getDiskScan(user.id, id, offset, user.role === 'admin'));
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await actor();
    if (!user) return failure('Unauthorized', 401);

    const parsed = startSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return failure('Invalid request. Use an absolute directory path.', 400);

    const data = parsed.data;
    if (data.action === 'scan') {
      const result = await startDiskScan(user.id, data.path, user.role === 'admin');
      return json(result, result.status === 'ready' ? 200 : 202);
    }
    await requireActiveAdmin(user, request);
    return json(await requestDiskDeletion(user.id, data.id, data.path));
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await actor();
    if (!user) return failure('Unauthorized', 401);
    const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return failure('Confirm the deletion before continuing.', 400);

    await requireActiveAdmin(user, request);
    await confirmDiskDeletion(user.id, parsed.data.id, parsed.data.token);
    return json({ success: true });
  } catch (error) {
    return routeError(error);
  }
}
