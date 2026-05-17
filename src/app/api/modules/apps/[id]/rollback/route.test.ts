/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockRollbackManagedApp } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRollbackManagedApp: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/apps/service', () => ({ rollbackManagedApp: mockRollbackManagedApp }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { POST } from './route';

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
    expect(mockRollbackManagedApp).not.toHaveBeenCalled();
  });

  it('rolls back to a release for admins', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockRollbackManagedApp.mockResolvedValue({
      releaseId: 'release-1',
      status: 'active',
      logs: ['Rolled back to release-1'],
    });

    const res = await POST(makeRequest({ releaseId: 'release-1' }), {
      params: Promise.resolve({ id: 'app-1' }),
    });

    expect(res.status).toBe(200);
    expect(mockRollbackManagedApp).toHaveBeenCalledWith('app-1', 'release-1');
    await expect(res.json()).resolves.toEqual({
      rollback: {
        releaseId: 'release-1',
        status: 'active',
        logs: ['Rolled back to release-1'],
      },
    });
  });

  it('returns 400 when releaseId is missing', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });

    const res = await POST(makeRequest({}), {
      params: Promise.resolve({ id: 'app-1' }),
    });

    expect(res.status).toBe(400);
    expect(mockRollbackManagedApp).not.toHaveBeenCalled();
  });
});
