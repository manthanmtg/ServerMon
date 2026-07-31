/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockDeployManagedApp, mockEnqueueAppOperation } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockDeployManagedApp: vi.fn(),
  mockEnqueueAppOperation: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/apps/service', () => ({ deployManagedApp: mockDeployManagedApp }));
vi.mock('@/lib/apps/application/enqueue-operation', () => ({
  enqueueAppOperation: mockEnqueueAppOperation,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { POST } from './route';

describe('/api/modules/apps/[id]/deploy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when session is missing', async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'app-1' }),
    });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockEnqueueAppOperation).not.toHaveBeenCalled();
    expect(mockDeployManagedApp).not.toHaveBeenCalled();
  });

  it('enqueues deploy and returns an accepted operation summary', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1', username: 'root', role: 'admin' } });
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

    const res = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'app-1' }),
    });

    expect(res.status).toBe(202);
    expect(res.headers.get('Location')).toBe('/api/modules/apps/operations/op_1');
    expect(mockDeployManagedApp).not.toHaveBeenCalled();
    expect(mockEnqueueAppOperation).toHaveBeenCalledWith({
      appId: 'app-1',
      type: 'deploy',
      requestedBy: { userId: 'user-1', username: 'root', role: 'admin' },
    });
    await expect(res.json()).resolves.toEqual({
      deployment: { operationId: 'op_1', status: 'queued', phase: 'queued' },
    });
  });
});
