/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetSession, mockFind } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFind: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/models/FleetLogEvent', () => ({
  default: { find: mockFind },
}));

import { GET } from './route';

function makeReq(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/fleet/logs');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

function chainResolving(docs: unknown[]) {
  return {
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(docs),
  };
}

describe('GET /api/fleet/logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
  });

  it('returns 401 without session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('returns events with null nextCursor when under limit', async () => {
    mockFind.mockReturnValue(chainResolving([{ _id: 'e1' }, { _id: 'e2' }]));
    const res = await GET(makeReq({ limit: '100' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.events).toHaveLength(2);
    expect(json.nextCursor).toBeNull();
  });

  it('returns nextCursor when exactly limit entries', async () => {
    mockFind.mockReturnValue(chainResolving([{ _id: 'e1' }, { _id: 'e2' }]));
    const res = await GET(makeReq({ limit: '2' }));
    const json = await res.json();
    expect(json.nextCursor).toBe('e2');
  });

  it('caps limit at 500', async () => {
    const chain = chainResolving([]);
    mockFind.mockReturnValue(chain);
    await GET(makeReq({ limit: '9999' }));
    expect(chain.limit).toHaveBeenCalledWith(500);
  });

  it('applies filters', async () => {
    mockFind.mockReturnValue(chainResolving([]));
    await GET(
      makeReq({
        nodeId: 'n1',
        routeId: 'r1',
        service: 'frps',
        level: 'info',
        eventType: 'frps.toggle',
        correlationId: 'c-1',
        audit: 'true',
      })
    );
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 'n1',
        routeId: 'r1',
        service: 'frps',
        level: 'info',
        eventType: 'frps.toggle',
        correlationId: 'c-1',
        audit: true,
      })
    );
  });

  it('applies since/until as createdAt bounds', async () => {
    mockFind.mockReturnValue(chainResolving([]));
    await GET(
      makeReq({
        since: '2025-01-01T00:00:00Z',
        until: '2025-02-01T00:00:00Z',
      })
    );
    const arg = mockFind.mock.calls[0][0];
    expect(arg.createdAt.$gte instanceof Date).toBe(true);
    expect(arg.createdAt.$lte instanceof Date).toBe(true);
  });

  it('applies cursor as _id $lt', async () => {
    mockFind.mockReturnValue(chainResolving([]));
    await GET(makeReq({ cursor: 'abc' }));
    const arg = mockFind.mock.calls[0][0];
    expect(arg._id).toEqual({ $lt: 'abc' });
  });

  it('returns 500 on db error', async () => {
    mockFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockRejectedValue(new Error('db')),
    });
    const res = await GET(makeReq());
    expect(res.status).toBe(500);
  });
});
