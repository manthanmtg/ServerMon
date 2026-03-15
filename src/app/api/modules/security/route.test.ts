/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSnapshot } = vi.hoisted(() => ({
  mockGetSnapshot: vi.fn(),
}));

vi.mock('@/lib/security/service', () => ({
  securityService: { getSnapshot: mockGetSnapshot },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';

describe('GET /api/modules/security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns security snapshot on success', async () => {
    const snapshot = { firewall: { active: true }, ssh: { passwordAuth: false } };
    mockGetSnapshot.mockResolvedValue(snapshot);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.firewall.active).toBe(true);
  });

  it('returns empty snapshot', async () => {
    mockGetSnapshot.mockResolvedValue({});
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({});
  });

  it('returns 500 on service error', async () => {
    mockGetSnapshot.mockRejectedValue(new Error('permission denied'));
    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch security snapshot');
  });

  it('returns 500 with error structure', async () => {
    mockGetSnapshot.mockRejectedValue(new Error('fail'));
    const res = await GET();
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });
});
