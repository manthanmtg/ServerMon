/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSnapshot } = vi.hoisted(() => ({
  mockGetSnapshot: vi.fn(),
}));

vi.mock('@/lib/certificates/service', () => ({
  certificatesService: { getSnapshot: mockGetSnapshot },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';

describe('GET /api/modules/certificates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns certificates snapshot on success', async () => {
    const snapshot = { certificates: [{ domain: 'example.com', expiry: '2025-01-01' }] };
    mockGetSnapshot.mockResolvedValue(snapshot);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.certificates).toHaveLength(1);
  });

  it('returns empty certificates list', async () => {
    mockGetSnapshot.mockResolvedValue({ certificates: [] });
    const res = await GET();
    const json = await res.json();
    expect(json.certificates).toEqual([]);
  });

  it('returns 500 on service error', async () => {
    mockGetSnapshot.mockRejectedValue(new Error('certbot not found'));
    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch certificates snapshot');
  });
});
