/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSession, mockGetTopMemoryProcesses } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetTopMemoryProcesses: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/memory/service', () => ({
  memoryService: { getTopMemoryProcesses: mockGetTopMemoryProcesses },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';

function makeRequest(params?: Record<string, string>): Request {
  const url = new URL('http://localhost/api/modules/memory/processes');
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return new Request(url.toString());
}

describe('GET /api/modules/memory/processes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns top memory processes', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    const processes = [{ pid: 1, name: 'node', memMb: 200 }];
    mockGetTopMemoryProcesses.mockResolvedValue(processes);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(mockGetTopMemoryProcesses).toHaveBeenCalledWith(10);
  });

  it('respects limit param', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockGetTopMemoryProcesses.mockResolvedValue([]);
    const res = await GET(makeRequest({ limit: '20' }));
    expect(res.status).toBe(200);
    expect(mockGetTopMemoryProcesses).toHaveBeenCalledWith(20);
  });

  it('caps limit at 50', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockGetTopMemoryProcesses.mockResolvedValue([]);
    await GET(makeRequest({ limit: '100' }));
    expect(mockGetTopMemoryProcesses).toHaveBeenCalledWith(50);
  });

  it('uses default limit of 10 when not provided', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockGetTopMemoryProcesses.mockResolvedValue([]);
    await GET(makeRequest());
    expect(mockGetTopMemoryProcesses).toHaveBeenCalledWith(10);
  });

  it('returns 500 on service error', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockGetTopMemoryProcesses.mockRejectedValue(new Error('ps failed'));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch memory processes');
  });
});
