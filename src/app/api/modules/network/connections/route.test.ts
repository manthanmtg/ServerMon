/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSnapshot, mockGetSession } = vi.hoisted(() => ({
  mockGetSnapshot: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock('@/lib/network/service', () => ({
  networkService: { getSnapshot: mockGetSnapshot },
}));
vi.mock('@/lib/session', () => ({
  getSession: mockGetSession,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';

describe('GET /api/modules/network/connections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } });
  });

  it('blocks unauthenticated requests before reading network connections', async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(mockGetSnapshot).not.toHaveBeenCalled();
  });

  it('returns connections array from snapshot', async () => {
    const connections = [{ state: 'ESTABLISHED', localAddress: '127.0.0.1' }];
    mockGetSnapshot.mockResolvedValue({ interfaces: [], connections });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(connections);
  });

  it('returns empty array when no connections', async () => {
    mockGetSnapshot.mockResolvedValue({ interfaces: [], connections: [] });
    const res = await GET();
    const json = await res.json();
    expect(json).toEqual([]);
  });

  it('returns 500 on service error', async () => {
    mockGetSnapshot.mockRejectedValue(new Error('netstat failure'));
    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch network connections');
  });
});
