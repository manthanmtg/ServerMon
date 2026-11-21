/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetSession,
  mockConnectDB,
  mockFindById,
  mockFindByIdAndUpdate,
  mockCreate,
  mockPruneAllAppReleases,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockConnectDB: vi.fn(),
  mockFindById: vi.fn(),
  mockFindByIdAndUpdate: vi.fn(),
  mockCreate: vi.fn(),
  mockPruneAllAppReleases: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/db', () => ({ default: mockConnectDB }));
vi.mock('@/models/AppsSettings', () => ({
  default: { findById: mockFindById, findByIdAndUpdate: mockFindByIdAndUpdate, create: mockCreate },
}));
vi.mock('@/lib/apps/releases', () => ({ pruneAllAppReleases: mockPruneAllAppReleases }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET, PUT } from './route';

function putRequest(body?: unknown) {
  return new Request('http://localhost/api/modules/apps/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof PUT>[0];
}

const storedSettings = { _id: 'apps-settings', releaseRetention: 10 };

describe('/api/modules/apps/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindById.mockReturnValue({ lean: () => Promise.resolve(storedSettings) });
    mockFindByIdAndUpdate.mockReturnValue({
      lean: () => Promise.resolve({ ...storedSettings, releaseRetention: 5 }),
    });
    mockPruneAllAppReleases.mockResolvedValue({ appsPruned: 0 });
  });

  it('returns 401 when the session is not an admin', async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it('returns existing settings for admins', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.settings).toEqual(storedSettings);
  });

  it('rejects out-of-range retention values', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });

    const res = await PUT(putRequest({ releaseRetention: 999 }));

    expect(res.status).toBe(400);
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('updates retention and prunes apps for admins', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });

    const res = await PUT(putRequest({ releaseRetention: 5 }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.settings.releaseRetention).toBe(5);
    expect(mockPruneAllAppReleases).toHaveBeenCalledTimes(1);
  });

  it('still saves settings when pruning fails after the update', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockPruneAllAppReleases.mockRejectedValue(new Error('prune failed'));

    const res = await PUT(putRequest({ releaseRetention: 5 }));

    expect(res.status).toBe(200);
    expect(mockFindByIdAndUpdate).toHaveBeenCalledTimes(1);
  });
});
