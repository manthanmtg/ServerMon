/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockDeployManagedApp } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockDeployManagedApp: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSession: mockGetSession,
}));

vi.mock('@/lib/apps/service', () => ({
  deployManagedApp: mockDeployManagedApp,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { POST } from './route';

describe('/api/modules/apps/[id]/deploy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when session is missing', async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await POST(new Request('http://localhost'), { params: Promise.resolve({ id: 'app-1' }) });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockDeployManagedApp).not.toHaveBeenCalled();
  });

  it('returns 401 when user role is not admin', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'viewer' } });

    const res = await POST(new Request('http://localhost'), { params: Promise.resolve({ id: 'app-1' }) });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockDeployManagedApp).not.toHaveBeenCalled();
  });

  it('deploys app and returns active deployment payload with status 200', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockDeployManagedApp.mockResolvedValue({
      id: 'app-1',
      status: 'active',
      releaseId: 'release-1',
    });

    const res = await POST(new Request('http://localhost'), { params: Promise.resolve({ id: 'app-1' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockDeployManagedApp).toHaveBeenCalledWith('app-1');
    expect(body).toEqual({ deployment: { id: 'app-1', status: 'active', releaseId: 'release-1' } });
  });

  it('returns 500 when deployment status is inactive', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockDeployManagedApp.mockResolvedValue({
      id: 'app-1',
      status: 'error',
      message: 'No release available',
    });

    const res = await POST(new Request('http://localhost'), { params: Promise.resolve({ id: 'app-1' }) });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ deployment: { id: 'app-1', status: 'error', message: 'No release available' } });
  });

  it('returns 500 with service error message when deployment throws', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockDeployManagedApp.mockRejectedValue(new Error('Worker failed'));

    const res = await POST(new Request('http://localhost'), { params: Promise.resolve({ id: 'app-1' }) });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: 'Worker failed' });
  });

  it('returns 500 with default message for non-error exceptions', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockDeployManagedApp.mockRejectedValue('oops');

    const res = await POST(new Request('http://localhost'), { params: Promise.resolve({ id: 'app-1' }) });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: 'Failed to deploy app' });
  });
});

