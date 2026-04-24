/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetSession,
  mockRouteFindById,
  mockRouteFindByIdAndUpdate,
  mockRouteFindByIdAndDelete,
  mockNodeFindById,
  mockFrpFindOne,
  mockConfigFindOne,
  mockConfigCreate,
  mockConfigDeleteMany,
  mockFleetLogCreate,
  mockApplyRevision,
  mockGetFrpOrchestrator,
  mockGetNginxOrchestrator,
  mockEmit,
  mockResolveDomain,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRouteFindById: vi.fn(),
  mockRouteFindByIdAndUpdate: vi.fn(),
  mockRouteFindByIdAndDelete: vi.fn(),
  mockNodeFindById: vi.fn(),
  mockFrpFindOne: vi.fn(),
  mockConfigFindOne: vi.fn(),
  mockConfigCreate: vi.fn(),
  mockConfigDeleteMany: vi.fn(),
  mockFleetLogCreate: vi.fn(),
  mockApplyRevision: vi.fn(),
  mockGetFrpOrchestrator: vi.fn(() => ({})),
  mockGetNginxOrchestrator: vi.fn(() => ({})),
  mockEmit: vi.fn(),
  mockResolveDomain: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));

vi.mock('@/models/PublicRoute', async () => {
  const { PublicRouteZodSchema } =
    await vi.importActual<typeof import('@/models/PublicRoute')>('@/models/PublicRoute');
  return {
    default: {
      findById: mockRouteFindById,
      findByIdAndUpdate: mockRouteFindByIdAndUpdate,
      findByIdAndDelete: mockRouteFindByIdAndDelete,
    },
    PublicRouteZodSchema,
  };
});

vi.mock('@/models/Node', () => ({
  default: { findById: mockNodeFindById },
}));
vi.mock('@/models/FleetLogEvent', () => ({
  default: { create: mockFleetLogCreate },
}));
vi.mock('@/models/ConfigRevision', () => ({
  default: {
    findOne: mockConfigFindOne,
    create: mockConfigCreate,
    deleteMany: mockConfigDeleteMany,
  },
}));
vi.mock('@/models/FrpServerState', () => ({
  default: { findOne: mockFrpFindOne },
}));
vi.mock('@/lib/fleet/orchestrators', () => ({
  getFrpOrchestrator: mockGetFrpOrchestrator,
  getNginxOrchestrator: mockGetNginxOrchestrator,
}));
vi.mock('@/lib/fleet/applyEngine', () => ({
  applyRevision: mockApplyRevision,
}));
vi.mock('@/lib/fleet/eventBus', () => ({
  fleetEventBus: {
    emit: mockEmit,
    subscribe: vi.fn(),
    subscribeFiltered: vi.fn(),
  },
}));
vi.mock('@/lib/fleet/dns', () => ({
  resolveDomain: mockResolveDomain,
}));

import { GET, PATCH, DELETE } from './route';

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

const baseRoute = {
  _id: 'route-1',
  name: 'Docs',
  slug: 'docs',
  domain: 'docs.example.com',
  path: '/',
  nodeId: 'node-1',
  proxyRuleName: 'web',
  target: { localIp: '127.0.0.1', localPort: 3000, protocol: 'http' },
  tlsEnabled: true,
  http2Enabled: true,
  websocketEnabled: false,
  maxBodyMb: 32,
  timeoutSeconds: 60,
  compression: true,
  accessMode: 'servermon_auth',
  headers: {},
};

describe('GET /api/fleet/routes/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
  });

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    mockRouteFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(baseRoute) });
    const res = await GET(new NextRequest('http://localhost'), makeContext('route-1'));
    expect(res.status).toBe(401);
  });

  it('returns the route', async () => {
    mockRouteFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(baseRoute) });
    const res = await GET(new NextRequest('http://localhost'), makeContext('route-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.route.slug).toBe('docs');
  });

  it('returns 404 when not found', async () => {
    mockRouteFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await GET(new NextRequest('http://localhost'), makeContext('route-1'));
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/fleet/routes/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
    mockFrpFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ vhostHttpPort: 8080 }),
    });
    mockConfigFindOne.mockReturnValue({
      sort: () => ({ lean: vi.fn().mockResolvedValue(null) }),
    });
    mockConfigCreate.mockResolvedValue({ _id: 'rev1' });
    mockFleetLogCreate.mockResolvedValue({});
    mockResolveDomain.mockResolvedValue({ ips: ['203.0.113.10'] });
  });

  function makeReq(body: unknown): NextRequest {
    return new NextRequest('http://localhost', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await PATCH(makeReq({ name: 'Updated' }), makeContext('route-1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for viewer role on PATCH', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'v', role: 'user' } });
    const res = await PATCH(makeReq({ name: 'Updated' }), makeContext('route-1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when route not found', async () => {
    mockRouteFindById.mockResolvedValue(null);
    const res = await PATCH(makeReq({ name: 'Updated' }), makeContext('route-1'));
    expect(res.status).toBe(404);
  });

  it('updates route, saves revision, emits audit', async () => {
    mockRouteFindById.mockResolvedValue({ ...baseRoute });
    const updatedDoc = {
      ...baseRoute,
      name: 'Docs II',
      toObject: () => ({ ...baseRoute, name: 'Docs II' }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockRouteFindByIdAndUpdate.mockResolvedValue(updatedDoc);

    const res = await PATCH(makeReq({ name: 'Docs II' }), makeContext('route-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.route.name).toBe('Docs II');
    expect(mockConfigCreate).toHaveBeenCalled();
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'route.update', audit: true })
    );
  });

  it('rejects invalid input with 400', async () => {
    mockRouteFindById.mockResolvedValue({ ...baseRoute });
    const res = await PATCH(makeReq({ maxBodyMb: 9999 }), makeContext('route-1'));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid input');
  });

  it('does NOT auto-apply revision when FLEET_AUTO_APPLY_REVISIONS is unset', async () => {
    const prev = process.env.FLEET_AUTO_APPLY_REVISIONS;
    delete process.env.FLEET_AUTO_APPLY_REVISIONS;
    try {
      mockRouteFindById.mockResolvedValue({ ...baseRoute });
      const updatedDoc = {
        ...baseRoute,
        name: 'Docs III',
        toObject: () => ({ ...baseRoute, name: 'Docs III' }),
        save: vi.fn().mockResolvedValue(undefined),
      };
      mockRouteFindByIdAndUpdate.mockResolvedValue(updatedDoc);
      mockApplyRevision.mockResolvedValue({ kind: 'nginx', reloaded: true });
      const res = await PATCH(makeReq({ name: 'Docs III' }), makeContext('route-1'));
      expect(res.status).toBe(200);
      expect(mockApplyRevision).not.toHaveBeenCalled();
    } finally {
      if (prev !== undefined) process.env.FLEET_AUTO_APPLY_REVISIONS = prev;
    }
  });

  it('auto-applies revision when FLEET_AUTO_APPLY_REVISIONS=true', async () => {
    const prev = process.env.FLEET_AUTO_APPLY_REVISIONS;
    process.env.FLEET_AUTO_APPLY_REVISIONS = 'true';
    try {
      mockRouteFindById.mockResolvedValue({ ...baseRoute });
      const updatedDoc = {
        ...baseRoute,
        name: 'Docs IV',
        toObject: () => ({ ...baseRoute, name: 'Docs IV' }),
        save: vi.fn().mockResolvedValue(undefined),
      };
      mockRouteFindByIdAndUpdate.mockResolvedValue(updatedDoc);
      mockApplyRevision.mockResolvedValue({ kind: 'nginx', reloaded: true });
      const res = await PATCH(makeReq({ name: 'Docs IV' }), makeContext('route-1'));
      expect(res.status).toBe(200);
      expect(mockApplyRevision).toHaveBeenCalledTimes(1);
    } finally {
      if (prev === undefined) delete process.env.FLEET_AUTO_APPLY_REVISIONS;
      else process.env.FLEET_AUTO_APPLY_REVISIONS = prev;
    }
  });

  it('emits route.status_change when status differs after update', async () => {
    mockRouteFindById.mockResolvedValue({ ...baseRoute, status: 'pending' });
    const updatedDoc = {
      ...baseRoute,
      name: 'Docs V',
      status: 'active',
      toObject: () => ({ ...baseRoute, name: 'Docs V', status: 'active' }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockRouteFindByIdAndUpdate.mockResolvedValue(updatedDoc);

    const res = await PATCH(makeReq({ name: 'Docs V' }), makeContext('route-1'));
    expect(res.status).toBe(200);
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'route.status_change',
        routeId: 'route-1',
        at: expect.any(String),
        data: expect.objectContaining({ from: 'pending', to: 'active' }),
      })
    );
  });

  it('re-checks DNS and sets dnsStatus=ok when resolver returns IPs', async () => {
    mockResolveDomain.mockResolvedValue({ ips: ['203.0.113.42'] });
    mockRouteFindById.mockResolvedValue({ ...baseRoute });
    const save = vi.fn().mockResolvedValue(undefined);
    const updatedDoc: {
      name: string;
      dnsStatus?: string;
      toObject: () => Record<string, unknown>;
      save: () => Promise<void>;
    } = {
      ...baseRoute,
      name: 'Docs DNS-OK',
      toObject: () => ({ ...baseRoute, name: 'Docs DNS-OK' }),
      save,
    };
    mockRouteFindByIdAndUpdate.mockResolvedValue(updatedDoc);

    const res = await PATCH(makeReq({ name: 'Docs DNS-OK' }), makeContext('route-1'));
    expect(res.status).toBe(200);
    expect(mockResolveDomain).toHaveBeenCalledWith('docs.example.com');
    expect(updatedDoc.dnsStatus).toBe('ok');
    expect(save).toHaveBeenCalled();
  });

  it('re-checks DNS and sets dnsStatus=missing when resolver returns no IPs', async () => {
    mockResolveDomain.mockResolvedValue({ ips: [] });
    mockRouteFindById.mockResolvedValue({ ...baseRoute });
    const save = vi.fn().mockResolvedValue(undefined);
    const updatedDoc: {
      name: string;
      dnsStatus?: string;
      toObject: () => Record<string, unknown>;
      save: () => Promise<void>;
    } = {
      ...baseRoute,
      name: 'Docs DNS-MISS',
      toObject: () => ({ ...baseRoute, name: 'Docs DNS-MISS' }),
      save,
    };
    mockRouteFindByIdAndUpdate.mockResolvedValue(updatedDoc);

    const res = await PATCH(makeReq({ name: 'Docs DNS-MISS' }), makeContext('route-1'));
    expect(res.status).toBe(200);
    expect(updatedDoc.dnsStatus).toBe('missing');
  });

  it('re-checks DNS and tolerates resolver errors (missing)', async () => {
    mockResolveDomain.mockRejectedValue(new Error('nxdomain'));
    mockRouteFindById.mockResolvedValue({ ...baseRoute });
    const save = vi.fn().mockResolvedValue(undefined);
    const updatedDoc: {
      name: string;
      dnsStatus?: string;
      toObject: () => Record<string, unknown>;
      save: () => Promise<void>;
    } = {
      ...baseRoute,
      name: 'Docs DNS-ERR',
      toObject: () => ({ ...baseRoute, name: 'Docs DNS-ERR' }),
      save,
    };
    mockRouteFindByIdAndUpdate.mockResolvedValue(updatedDoc);

    const res = await PATCH(makeReq({ name: 'Docs DNS-ERR' }), makeContext('route-1'));
    expect(res.status).toBe(200);
    expect(updatedDoc.dnsStatus).toBe('missing');
  });

  it('does NOT emit route.status_change when status is unchanged', async () => {
    mockRouteFindById.mockResolvedValue({ ...baseRoute, status: 'active' });
    const updatedDoc = {
      ...baseRoute,
      name: 'Docs VI',
      status: 'active',
      toObject: () => ({ ...baseRoute, name: 'Docs VI', status: 'active' }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockRouteFindByIdAndUpdate.mockResolvedValue(updatedDoc);

    const res = await PATCH(makeReq({ name: 'Docs VI' }), makeContext('route-1'));
    expect(res.status).toBe(200);
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/fleet/routes/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
    mockFleetLogCreate.mockResolvedValue({});
    mockConfigDeleteMany.mockResolvedValue({ deletedCount: 0 });
  });

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await DELETE(new NextRequest('http://localhost'), makeContext('route-1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for viewer role on DELETE', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'v', role: 'user' } });
    const res = await DELETE(new NextRequest('http://localhost'), makeContext('route-1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when not found', async () => {
    mockRouteFindById.mockResolvedValue(null);
    const res = await DELETE(new NextRequest('http://localhost'), makeContext('route-1'));
    expect(res.status).toBe(404);
  });

  it('disables proxy rule on node, removes revisions, emits audit, deletes doc', async () => {
    mockRouteFindById.mockResolvedValue({ ...baseRoute });

    const nodeSave = vi.fn().mockResolvedValue(undefined);
    const nodeDoc = {
      _id: 'node-1',
      proxyRules: [
        { name: 'web', enabled: true, status: 'active' },
        { name: 'api', enabled: true, status: 'active' },
      ],
      save: nodeSave,
    };
    mockNodeFindById.mockResolvedValue(nodeDoc);
    mockRouteFindByIdAndDelete.mockResolvedValue({ ...baseRoute });

    const res = await DELETE(new NextRequest('http://localhost'), makeContext('route-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deleted).toBe(true);

    expect(nodeDoc.proxyRules[0].enabled).toBe(false);
    expect(nodeDoc.proxyRules[0].status).toBe('disabled');
    expect(nodeDoc.proxyRules[1].enabled).toBe(true); // unrelated rule untouched
    expect(nodeSave).toHaveBeenCalled();

    expect(mockConfigDeleteMany).toHaveBeenCalledWith({
      kind: 'nginx',
      targetId: 'route-1',
    });
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'route.delete', audit: true })
    );
    expect(mockRouteFindByIdAndDelete).toHaveBeenCalledWith('route-1');
  });

  it('returns 500 on unexpected error', async () => {
    mockRouteFindById.mockRejectedValue(new Error('db'));
    const res = await DELETE(new NextRequest('http://localhost'), makeContext('route-1'));
    expect(res.status).toBe(500);
  });
});
