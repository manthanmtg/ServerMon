/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetSession, mockFind, mockCountDocuments } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFind: vi.fn(),
  mockCountDocuments: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/models/ConfigRevision', () => ({
  default: { find: mockFind, countDocuments: mockCountDocuments },
}));

import { GET } from './route';

function makeReq(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/fleet/revisions');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

describe('GET /api/fleet/revisions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
    mockFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    mockCountDocuments.mockResolvedValue(0);
  });

  it('returns 401 without session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('returns revisions + total', async () => {
    mockFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([{ _id: 'r1', version: 2 }]),
    });
    mockCountDocuments.mockResolvedValue(1);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.revisions).toHaveLength(1);
    expect(json.total).toBe(1);
  });

  it('applies kind and targetId filters', async () => {
    await GET(makeReq({ kind: 'frpc', targetId: 'n1' }));
    expect(mockFind).toHaveBeenCalledWith({ kind: 'frpc', targetId: 'n1' });
  });

  it('sorts by version desc', async () => {
    const chain = {
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    };
    mockFind.mockReturnValue(chain);
    await GET(makeReq());
    expect(chain.sort).toHaveBeenCalledWith({ version: -1 });
  });
});
