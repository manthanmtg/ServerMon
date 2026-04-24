/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetSession, mockFindById } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFindById: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/models/ConfigRevision', () => ({
  default: { findById: mockFindById },
}));

import { GET } from './route';

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/fleet/revisions/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
  });

  it('returns 401 without session', async () => {
    mockGetSession.mockResolvedValue(null);
    mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue({}) });
    const res = await GET(new NextRequest('http://localhost'), ctx('r1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when not found', async () => {
    mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await GET(new NextRequest('http://localhost'), ctx('r1'));
    expect(res.status).toBe(404);
  });

  it('returns revision including diffFromPrevious and rendered', async () => {
    const doc = {
      _id: 'r1',
      version: 2,
      rendered: 'bindPort = 7000\n',
      diffFromPrevious: '+foo',
    };
    mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(doc) });
    const res = await GET(new NextRequest('http://localhost'), ctx('r1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.revision).toEqual(doc);
  });
});
