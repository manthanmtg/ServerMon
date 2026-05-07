/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockStartExplorer, mockStopExplorer } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockStartExplorer: vi.fn(),
  mockStopExplorer: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/databases/service', () => ({
  startManagedDatabaseExplorer: mockStartExplorer,
  stopManagedDatabaseExplorer: mockStopExplorer,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { DELETE, POST } from './route';

describe('/api/modules/databases/[id]/explore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires admin access to start an explorer', async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'db-1' }),
    });

    expect(res.status).toBe(401);
    expect(mockStartExplorer).not.toHaveBeenCalled();
  });

  it('starts the managed explorer and returns its proxy path', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockStartExplorer.mockResolvedValue({
      status: 'running',
      kind: 'mongo-express',
      proxyPath: '/api/modules/databases/db-1/explore/proxy/',
    });

    const res = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'db-1' }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockStartExplorer).toHaveBeenCalledWith('db-1');
    expect(json.explorer.proxyPath).toBe('/api/modules/databases/db-1/explore/proxy/');
  });

  it('stops the managed explorer', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockStopExplorer.mockResolvedValue({ status: 'stopped' });

    const res = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'db-1' }),
    });

    expect(res.status).toBe(200);
    expect(mockStopExplorer).toHaveBeenCalledWith('db-1');
  });
});
