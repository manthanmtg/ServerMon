/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockPerformDatabaseAction } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockPerformDatabaseAction: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/databases/service', () => ({
  performManagedDatabaseAction: mockPerformDatabaseAction,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { POST } from './route';

function makeRequest(action: string): Request {
  return new Request('http://localhost/api/modules/databases/db-1/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
}

describe('/api/modules/databases/[id]/action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires admin access to mutate database runtime state', async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await POST(makeRequest('restart'), { params: Promise.resolve({ id: 'db-1' }) });

    expect(res.status).toBe(401);
  });

  it('runs supported database actions', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockPerformDatabaseAction.mockResolvedValue({ id: 'db-1', status: 'running' });

    const res = await POST(makeRequest('restart'), { params: Promise.resolve({ id: 'db-1' }) });

    expect(res.status).toBe(200);
    expect(mockPerformDatabaseAction).toHaveBeenCalledWith('db-1', 'restart');
  });

  it('rejects unsupported database actions', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });

    const res = await POST(makeRequest('explode'), { params: Promise.resolve({ id: 'db-1' }) });

    expect(res.status).toBe(400);
    expect(mockPerformDatabaseAction).not.toHaveBeenCalled();
  });
});
