/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSnapshot, mockGetSession } = vi.hoisted(() => ({
  mockGetSnapshot: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock('@/lib/ports/service', () => ({
  portsService: { getSnapshot: mockGetSnapshot },
}));
vi.mock('@/lib/session', () => ({
  getSession: mockGetSession,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';

describe('GET /api/modules/ports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } });
  });

  it('blocks unauthenticated requests before reading host port details', async () => {
    mockGetSession.mockResolvedValue(null);
    mockGetSnapshot.mockResolvedValue({ ports: [] });

    const res = await GET();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(mockGetSnapshot).not.toHaveBeenCalled();
  });

  it('returns ports snapshot on success', async () => {
    const snapshot = { ports: [{ port: 80, state: 'open', process: 'nginx' }] };
    mockGetSnapshot.mockResolvedValue(snapshot);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ports).toHaveLength(1);
  });

  it('returns empty snapshot', async () => {
    mockGetSnapshot.mockResolvedValue({ ports: [] });
    const res = await GET();
    const json = await res.json();
    expect(json.ports).toEqual([]);
  });

  it('returns 500 on service error', async () => {
    mockGetSnapshot.mockRejectedValue(new Error('ss command failed'));
    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch ports snapshot');
  });
});
