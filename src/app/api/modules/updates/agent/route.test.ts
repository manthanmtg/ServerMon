/** @vitest-environment node */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetSession, mockGetServermonAgentStatus } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetServermonAgentStatus: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/updates/system-service', () => ({
  systemUpdateService: {
    getServermonAgentStatus: mockGetServermonAgentStatus,
  },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';

describe('GET /api/modules/updates/agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns colocated agent status', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    mockGetServermonAgentStatus.mockResolvedValue({
      serviceName: 'servermon-agent.service',
      installed: true,
      active: true,
      enabled: true,
      repoDir: '/opt/servermon-agent/source',
      updateSupported: true,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.agent).toMatchObject({
      installed: true,
      active: true,
      enabled: true,
      updateSupported: true,
    });
  });
});
