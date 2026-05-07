/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockDeleteManagedApp } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockDeleteManagedApp: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/apps/service', () => ({ deleteManagedApp: mockDeleteManagedApp }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { DELETE } from './route';

describe('/api/modules/apps/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when deleting without an admin session', async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'app-1' }),
    });

    expect(res.status).toBe(401);
    expect(mockDeleteManagedApp).not.toHaveBeenCalled();
  });

  it('deletes a managed app for admins', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockDeleteManagedApp.mockResolvedValue({ id: 'app-1', logs: ['Removed managed app root'] });

    const res = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'app-1' }),
    });

    expect(res.status).toBe(200);
    expect(mockDeleteManagedApp).toHaveBeenCalledWith('app-1');
    await expect(res.json()).resolves.toEqual({
      deletion: { id: 'app-1', logs: ['Removed managed app root'] },
    });
  });
});
