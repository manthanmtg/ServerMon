/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockGetSnapshot } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetSnapshot: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSession: mockGetSession,
}));
vi.mock('@/lib/firewall/service', () => ({
  firewallService: { getSnapshot: mockGetSnapshot },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';

describe('GET /api/modules/firewall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires an admin session', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'viewer' } });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockGetSnapshot).not.toHaveBeenCalled();
  });

  it('returns firewall snapshot for admins', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockGetSnapshot.mockResolvedValue({
      backend: 'ufw',
      available: true,
      enabled: true,
      rules: [],
      checks: [],
      summary: { healthScore: 96 },
    });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.backend).toBe('ufw');
    expect(json.summary.healthScore).toBe(96);
  });

  it('returns 500 on snapshot failure', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockGetSnapshot.mockRejectedValue(new Error('ufw failed'));

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe('Failed to fetch firewall snapshot');
  });
});
