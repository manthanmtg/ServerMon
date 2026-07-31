/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActiveAppOperationError } from '@/lib/apps/repositories/operation-repository';

const { mockGetSession, mockUpdateManagedGitApp, mockEnqueueAppOperation } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockUpdateManagedGitApp: vi.fn(),
  mockEnqueueAppOperation: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/apps/service', () => ({ updateManagedGitApp: mockUpdateManagedGitApp }));
vi.mock('@/lib/apps/application/enqueue-operation', () => ({
  enqueueAppOperation: mockEnqueueAppOperation,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { POST } from './route';

describe('/api/modules/apps/[id]/update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without an admin session', async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'app-1' }),
    });

    expect(res.status).toBe(401);
    expect(mockEnqueueAppOperation).not.toHaveBeenCalled();
    expect(mockUpdateManagedGitApp).not.toHaveBeenCalled();
  });

  it('enqueues update and returns an accepted operation summary', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1', username: 'root', role: 'admin' } });
    mockEnqueueAppOperation.mockResolvedValue({
      operation: {
        id: 'op_1',
        appId: 'app-1',
        type: 'update',
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

    const res = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'app-1' }),
    });

    expect(res.status).toBe(202);
    expect(mockUpdateManagedGitApp).not.toHaveBeenCalled();
    expect(mockEnqueueAppOperation).toHaveBeenCalledWith({
      appId: 'app-1',
      type: 'update',
      requestedBy: { userId: 'user-1', username: 'root', role: 'admin' },
    });
    await expect(res.json()).resolves.toEqual({
      update: { operationId: 'op_1', status: 'queued', phase: 'queued' },
    });
  });

  it('returns 409 when another operation is active for the app', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockEnqueueAppOperation.mockRejectedValue(new ActiveAppOperationError('app-1'));

    const res = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'app-1' }),
    });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: 'An app operation is already active for app app-1',
    });
  });
});
