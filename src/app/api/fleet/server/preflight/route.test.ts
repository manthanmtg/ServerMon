/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSession, mockFrpFindOne, mockNginxFindOne, mockCreateDefaultExecutors } = vi.hoisted(
  () => ({
    mockGetSession: vi.fn(),
    mockFrpFindOne: vi.fn(),
    mockNginxFindOne: vi.fn(),
    mockCreateDefaultExecutors: vi.fn(() => ({})),
  })
);

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/fleet/preflightExecutors', () => ({
  createDefaultExecutors: mockCreateDefaultExecutors,
}));

vi.mock('@/models/FrpServerState', () => ({
  default: { findOne: mockFrpFindOne },
}));
vi.mock('@/models/NginxState', () => ({
  default: { findOne: mockNginxFindOne },
}));

import { POST } from './route';

describe('POST /api/fleet/server/preflight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateDefaultExecutors.mockReturnValue({});
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    mockFrpFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        bindPort: 7000,
        vhostHttpPort: 8080,
        subdomainHost: 'example.com',
      }),
    });
    mockNginxFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        managedDir: '/etc/nginx/servermon',
        binaryPath: 'nginx',
      }),
    });
  });

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('runs preflight with empty executors; all results are skip', async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.results)).toBe(true);
    expect(json.results.length).toBeGreaterThan(0);
    expect(json.results.every((r: { status: string }) => r.status === 'skip')).toBe(true);
  });

  it('handles missing FRP and nginx state (uses defaults)', async () => {
    mockFrpFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });
    mockNginxFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });
    const res = await POST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.results)).toBe(true);
  });

  it('returns 500 on db error', async () => {
    mockFrpFindOne.mockImplementation(() => {
      throw new Error('db down');
    });
    const res = await POST();
    expect(res.status).toBe(500);
  });

  it('invokes createDefaultExecutors when env is populated', async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(mockCreateDefaultExecutors).toHaveBeenCalledTimes(1);
  });
});
