/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { navGroups } from '@/components/layout/navigation';

const { mockConnectDB, mockFindById, mockFindOneAndUpdate, mockGetSession } = vi.hoisted(() => ({
  mockConnectDB: vi.fn().mockResolvedValue(undefined),
  mockFindById: vi.fn(),
  mockFindOneAndUpdate: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: mockConnectDB }));
vi.mock('@/models/QuickAccessSettings', () => ({
  default: {
    findById: mockFindById,
    findOneAndUpdate: mockFindOneAndUpdate,
  },
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET, PUT } from './route';

function makePutRequest(body: unknown): Request {
  return new Request('http://localhost/api/settings/quick-access', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const sampleItem = { id: 'terminal', href: '/terminal', label: 'Terminal', icon: 'Terminal' };

describe('GET /api/settings/quick-access', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns items from DB', async () => {
    mockFindById.mockReturnValue({ lean: () => Promise.resolve({ items: [sampleItem] }) });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].id).toBe('terminal');
  });

  it('returns empty items when no settings exist', async () => {
    mockFindById.mockReturnValue({ lean: () => Promise.resolve(null) });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toEqual([]);
  });

  it('returns 500 on DB error', async () => {
    mockFindById.mockReturnValue({ lean: () => Promise.reject(new Error('db error')) });
    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch settings');
  });
});

describe('PUT /api/settings/quick-access', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await PUT(makePutRequest({ items: [] }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when not admin', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'viewer' } });
    const res = await PUT(makePutRequest({ items: [] }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid body', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    const res = await PUT(makePutRequest({ items: 'not-an-array' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid request body');
  });

  it('saves items and returns success', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockFindOneAndUpdate.mockResolvedValue({ items: [sampleItem] });

    const res = await PUT(makePutRequest({ items: [sampleItem] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.items).toHaveLength(1);
  });

  it('saves empty items list', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockFindOneAndUpdate.mockResolvedValue({ items: [] });

    const res = await PUT(makePutRequest({ items: [] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.items).toEqual([]);
  });

  it('accepts enough items to pin every primary navigation item', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockFindOneAndUpdate.mockResolvedValue({});

    const items = navGroups.flatMap((group) =>
      group.items.map((item) => ({
        id: item.href.replace(/^\//, '').replaceAll('/', '-') || 'dashboard',
        href: item.href,
        label: item.label,
        icon: item.label,
      }))
    );

    const res = await PUT(makePutRequest({ items }));
    expect(res.status).toBe(200);
  });

  it('rejects items exceeding max count of 64', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    const items = Array.from({ length: 65 }, (_, i) => ({
      id: `mod-${i}`,
      href: `/mod-${i}`,
      label: `Mod ${i}`,
      icon: 'Terminal',
    }));
    const res = await PUT(makePutRequest({ items }));
    expect(res.status).toBe(400);
  });

  it('returns 500 on DB error', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockFindOneAndUpdate.mockRejectedValue(new Error('db error'));
    const res = await PUT(makePutRequest({ items: [sampleItem] }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to update settings');
  });

  it('calls findOneAndUpdate with correct upsert params', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockFindOneAndUpdate.mockResolvedValue({});

    await PUT(makePutRequest({ items: [sampleItem] }));

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'quick-access-settings' },
      expect.objectContaining({ $set: expect.objectContaining({ items: [sampleItem] }) }),
      { upsert: true, new: true }
    );
  });
});
