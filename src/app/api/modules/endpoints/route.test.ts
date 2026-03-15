/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockFind, mockCountDocuments } = vi.hoisted(() => ({
  mockFind: vi.fn(),
  mockCountDocuments: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/models/CustomEndpoint', () => ({
  default: {
    find: mockFind,
    countDocuments: mockCountDocuments,
  },
}));

import { GET } from './route';

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/modules/endpoints');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

describe('GET /api/modules/endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const chainable = {
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    };
    mockFind.mockReturnValue(chainable);
    mockCountDocuments.mockResolvedValue(0);
  });

  it('returns endpoints and total on success', async () => {
    const endpoints = [{ _id: '1', name: 'Test', slug: 'test' }];
    mockFind.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(endpoints),
    });
    mockCountDocuments.mockResolvedValue(1);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.endpoints).toHaveLength(1);
    expect(json.total).toBe(1);
  });

  it('returns empty list when no endpoints', async () => {
    const res = await GET(makeRequest());
    const json = await res.json();
    expect(json.endpoints).toEqual([]);
    expect(json.total).toBe(0);
  });

  it('applies search filter', async () => {
    await GET(makeRequest({ search: 'my-endpoint' }));
    expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({ $or: expect.any(Array) }));
  });

  it('applies method filter', async () => {
    await GET(makeRequest({ method: 'post' }));
    expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST' }));
  });

  it('applies type filter', async () => {
    await GET(makeRequest({ type: 'script' }));
    expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({ endpointType: 'script' }));
  });

  it('applies tag filter', async () => {
    await GET(makeRequest({ tag: 'monitoring' }));
    expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({ tags: 'monitoring' }));
  });

  it('applies enabled=true filter', async () => {
    await GET(makeRequest({ enabled: 'true' }));
    expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });

  it('applies enabled=false filter', async () => {
    await GET(makeRequest({ enabled: 'false' }));
    expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it('caps limit at 200', async () => {
    const chainable = {
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    };
    mockFind.mockReturnValue(chainable);
    await GET(makeRequest({ limit: '999' }));
    expect(chainable.limit).toHaveBeenCalledWith(200);
  });

  it('returns 500 on db error', async () => {
    mockFind.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockRejectedValue(new Error('db error')),
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch endpoints');
  });
});
