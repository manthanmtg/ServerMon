/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetSession, mockNodeFindById, mockRouteFindOne, mockFrpFindOne } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockNodeFindById: vi.fn(),
  mockRouteFindOne: vi.fn(),
  mockFrpFindOne: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/models/Node', () => ({
  default: {
    findById: mockNodeFindById,
  },
}));
vi.mock('@/models/PublicRoute', () => ({
  default: {
    findOne: mockRouteFindOne,
  },
}));
vi.mock('@/models/FrpServerState', () => ({
  default: {
    findOne: mockFrpFindOne,
  },
}));

import { GET } from './route';

function makeContext(id = 'node-1') {
  return { params: Promise.resolve({ id }) };
}

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/fleet/nodes/node-1/servermon');
}

const node = {
  _id: 'node-1',
  name: 'Orion',
  slug: 'orion',
  status: 'online',
  tunnelStatus: 'connected',
  servermon: {
    installed: true,
    serviceName: 'servermon.service',
    serviceState: 'running',
    serviceEnabled: true,
    port: 8912,
    healthUrl: 'http://127.0.0.1:8912/api/health',
    healthStatus: 'healthy',
    lastCheckedAt: '2026-04-29T00:00:00.000Z',
  },
};

describe('GET /api/fleet/nodes/[id]/servermon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    mockNodeFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(node) });
    mockFrpFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ subdomainHost: 'ultron.manthanby.cv' }),
    });
  });

  it('returns an existing ServerMon route even when the proxy rule was named from the slug', async () => {
    const existingRoute = {
      _id: 'route-1',
      nodeId: 'node-1',
      name: 'Orion ServerMon',
      slug: 'orion-servermon',
      domain: 'orion-servermon.ultron.manthanby.cv',
      proxyRuleName: 'orion-servermon',
      target: { localIp: '127.0.0.1', localPort: 8912, protocol: 'http' },
      tlsEnabled: true,
      status: 'active',
      healthStatus: 'healthy',
    };
    mockRouteFindOne.mockImplementation((filter: Record<string, unknown>) => ({
      lean: vi
        .fn()
        .mockResolvedValue(
          filter.proxyRuleName === 'servermon'
            ? null
            : Array.isArray(filter.$or) &&
                filter.$or.some(
                  (condition) =>
                    typeof condition === 'object' &&
                    condition !== null &&
                    ('slug' in condition || 'domain' in condition || 'proxyRuleName' in condition)
                )
              ? existingRoute
              : null
        ),
    }));

    const res = await GET(makeReq(), makeContext());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.route).toMatchObject({
      _id: 'route-1',
      domain: 'orion-servermon.ultron.manthanby.cv',
      proxyRuleName: 'orion-servermon',
    });
  });
});
