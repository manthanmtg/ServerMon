/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockEnqueueAppOperation } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockEnqueueAppOperation: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
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

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/modules/apps/app-1/operations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('/api/modules/apps/[id]/operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires an admin session', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'viewer' } });

    const res = await POST(makeRequest({ type: 'deploy' }), {
      params: Promise.resolve({ id: 'app-1' }),
    });

    expect(res.status).toBe(401);
    expect(mockEnqueueAppOperation).not.toHaveBeenCalled();
  });

  it('rejects invalid operation payloads', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });

    const res = await POST(makeRequest({ type: 'restart' }), {
      params: Promise.resolve({ id: 'app-1' }),
    });

    expect(res.status).toBe(400);
    expect(mockEnqueueAppOperation).not.toHaveBeenCalled();
  });

  it('enqueues an operation and returns 202 with a Location header', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1', role: 'admin', username: 'root' } });
    mockEnqueueAppOperation.mockResolvedValue({
      operation: {
        id: 'op_1',
        appId: 'app-1',
        type: 'deploy',
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

    const res = await POST(makeRequest({ type: 'deploy' }, { 'Idempotency-Key': 'idem-1' }), {
      params: Promise.resolve({ id: 'app-1' }),
    });

    expect(res.status).toBe(202);
    expect(res.headers.get('Location')).toBe('/api/modules/apps/operations/op_1');
    expect(mockEnqueueAppOperation).toHaveBeenCalledWith({
      appId: 'app-1',
      type: 'deploy',
      targetReleaseId: undefined,
      idempotencyKey: 'idem-1',
      requestedBy: { userId: 'user-1', username: 'root', role: 'admin' },
    });
    await expect(res.json()).resolves.toEqual({
      data: {
        operation: {
          id: 'op_1',
          appId: 'app-1',
          type: 'deploy',
          status: 'queued',
          phase: 'queued',
          createdAt: '2026-07-31T05:00:00.000Z',
        },
        links: {
          self: '/api/modules/apps/operations/op_1',
          events: '/api/modules/apps/operations/op_1/events',
          cancel: '/api/modules/apps/operations/op_1/cancel',
        },
      },
    });
  });

  it('returns 503 when the Apps worker is unavailable', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockEnqueueAppOperation.mockRejectedValue(new AppsWorkerUnavailableError('stale'));

    const res = await POST(makeRequest({ type: 'update' }), {
      params: Promise.resolve({ id: 'app-1' }),
    });

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: APPS_WORKER_UNAVAILABLE_MESSAGE });
  });
});
