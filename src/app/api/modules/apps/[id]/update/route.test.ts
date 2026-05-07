/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockUpdateManagedGitApp } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockUpdateManagedGitApp: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/apps/service', () => ({ updateManagedGitApp: mockUpdateManagedGitApp }));
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
    expect(mockUpdateManagedGitApp).not.toHaveBeenCalled();
  });

  it('updates a git app and returns the deployment result', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockUpdateManagedGitApp.mockResolvedValue({
      status: 'active',
      releaseId: 'release-1',
      logs: ['updated'],
    });

    const res = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'app-1' }),
    });

    expect(res.status).toBe(200);
    expect(mockUpdateManagedGitApp).toHaveBeenCalledWith('app-1');
    await expect(res.json()).resolves.toEqual({
      update: { status: 'active', releaseId: 'release-1', logs: ['updated'] },
    });
  });

  it('returns 200 when no upstream changes are available', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockUpdateManagedGitApp.mockResolvedValue({
      status: 'unchanged',
      releaseId: 'release-1',
      logs: ['No upstream changes found.'],
    });

    const res = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'app-1' }),
    });

    expect(res.status).toBe(200);
  });
});
