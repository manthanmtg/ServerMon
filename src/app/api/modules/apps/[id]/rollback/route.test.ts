/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockRollbackManagedApp, mockEnqueueAppOperation } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRollbackManagedApp: vi.fn(),
  mockEnqueueAppOperation: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/apps/service', () => ({ rollbackManagedApp: mockRollbackManagedApp }));
vi.mock('@/lib/apps/application/enqueue-operation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apps/application/enqueue-operation')>();
  return { ...actual, enqueueAppOperation: mockEnqueueAppOperation };
});
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { POST } from './route';
import {
  APPS_WORKER_UNAVAILABLE_MESSAGE,
  AppsWorkerUnavailableError,
} from '@/lib/apps/application/enqueue-operation';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/modules/apps/app-1/rollback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/modules/apps/[id]/rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without an admin session', async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await POST(makeRequest({ releaseId: 'release-1' }), {
      params: Promise.resolve({ id: 'app-1' }),
    });

    expect(res.status).toBe(401);
    expect(mockEnqueueAppOperation).not.toHaveBeenCalled();
    expect(mockRollbackManagedApp).not.toHaveBeenCalled();
  });

  it('enqueues rollback to a release for admins', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1', username: 'root', role: 'admin' } });
    mockEnqueueAppOperation.mockResolvedValue({
      operation: {
        id: 'op_1',
        appId: 'app-1',
        type: 'rollback',
        status: 'queued',
        phase: 'queued',
        createdAt: '2026-07-31T05:00:00.000Z',
      },
      links: {
        self: '/api/modules/apps/operations/op_1',
        events: '/api/modules/apps/operations/op_1/events',
        cancel: '/api/modules/apps/operations/op_1/cancel',
      },
    });

    const res = await POST(makeRequest({ releaseId: 'release-1' }), {
      params: Promise.resolve({ id: 'app-1' }),
    });

    expect(res.status).toBe(202);
    expect(mockRollbackManagedApp).not.toHaveBeenCalled();
    expect(mockEnqueueAppOperation).toHaveBeenCalledWith({
      appId: 'app-1',
      type: 'rollback',
      targetReleaseId: 'release-1',
      requestedBy: { userId: 'user-1', username: 'root', role: 'admin' },
    });
    await expect(res.json()).resolves.toEqual({
      rollback: { operationId: 'op_1', status: 'queued', phase: 'queued' },
    });
  });

  it('returns 400 when releaseId is missing', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });

    const res = await POST(makeRequest({}), {
      params: Promise.resolve({ id: 'app-1' }),
    });

    expect(res.status).toBe(400);
    expect(mockEnqueueAppOperation).not.toHaveBeenCalled();
  });

  it('returns 503 when the Apps worker is unavailable', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockEnqueueAppOperation.mockRejectedValue(new AppsWorkerUnavailableError('not_running'));

    const res = await POST(makeRequest({ releaseId: 'release-1' }), {
      params: Promise.resolve({ id: 'app-1' }),
    });

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: APPS_WORKER_UNAVAILABLE_MESSAGE });
  });
});
