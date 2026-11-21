/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockGetManagedAppLogs } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetManagedAppLogs: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/apps/service', () => ({ getManagedAppLogsById: mockGetManagedAppLogs }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';

function makeRequest(params?: Record<string, string>): Request {
  const url = new URL('http://localhost/api/modules/apps/app-1/logs');
  if (params) {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  }
  return new Request(url.toString());
}

describe('/api/modules/apps/[id]/logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without an admin session', async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: 'app-1' }) });

    expect(res.status).toBe(401);
    expect(mockGetManagedAppLogs).not.toHaveBeenCalled();
  });

  it('returns bounded managed app logs for admins', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockGetManagedAppLogs.mockResolvedValue([
      {
        timestamp: '2026-05-06T12:00:00.000Z',
        priority: 'info',
        message: 'started',
        unit: 'servermon-app-lifeos.service',
      },
    ]);

    const res = await GET(makeRequest({ lines: '1000' }), {
      params: Promise.resolve({ id: 'app-1' }),
    });

    expect(res.status).toBe(200);
    expect(mockGetManagedAppLogs).toHaveBeenCalledWith('app-1', 500);
    await expect(res.json()).resolves.toEqual({
      logs: [
        {
          timestamp: '2026-05-06T12:00:00.000Z',
          priority: 'info',
          message: 'started',
          unit: 'servermon-app-lifeos.service',
        },
      ],
    });
  });
});
