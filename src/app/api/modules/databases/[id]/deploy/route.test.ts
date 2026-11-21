/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockDeployManagedDatabase } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockDeployManagedDatabase: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/databases/service', () => ({ deployManagedDatabase: mockDeployManagedDatabase }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { POST } from './route';

describe('/api/modules/databases/[id]/deploy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires admin access to start deployments', async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'db-1' }),
    });

    expect(res.status).toBe(401);
    expect(mockDeployManagedDatabase).not.toHaveBeenCalled();
  });

  it('accepts deployment and starts it in the background', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockDeployManagedDatabase.mockResolvedValue({ id: 'db-1', status: 'running' });

    const res = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'db-1' }),
    });
    const json = await res.json();

    expect(res.status).toBe(202);
    expect(json).toEqual({ accepted: true, id: 'db-1' });
    expect(mockDeployManagedDatabase).toHaveBeenCalledWith('db-1');
  });
});
