/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetSession,
  mockFindById,
  mockFindByIdAndUpdate,
  mockFindByIdAndDelete,
  mockFrpFindOne,
  mockConfigFindOne,
  mockConfigCreate,
  mockFleetLogCreate,
  mockApplyRevision,
  mockGetFrpOrchestrator,
  mockGetNginxOrchestrator,
  mockResourcePolicyFind,
  mockPublicRouteFind,
  mockPublicRouteUpdateMany,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFindById: vi.fn(),
  mockFindByIdAndUpdate: vi.fn(),
  mockFindByIdAndDelete: vi.fn(),
  mockFrpFindOne: vi.fn(),
  mockConfigFindOne: vi.fn(),
  mockConfigCreate: vi.fn(),
  mockFleetLogCreate: vi.fn(),
  mockApplyRevision: vi.fn(() => Promise.resolve({ kind: 'mock', reloaded: false })),
  mockGetFrpOrchestrator: vi.fn(() => ({})),
  mockGetNginxOrchestrator: vi.fn(() => ({})),
  mockResourcePolicyFind: vi.fn(),
  mockPublicRouteFind: vi.fn(),
  mockPublicRouteUpdateMany: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));

vi.mock('@/models/Node', async () => {
  const { NodeZodSchema } = await vi.importActual<typeof import('@/models/Node')>('@/models/Node');
  return {
    default: {
      findById: mockFindById,
      findByIdAndUpdate: mockFindByIdAndUpdate,
      findByIdAndDelete: mockFindByIdAndDelete,
    },
    NodeZodSchema,
  };
});

vi.mock('@/models/FleetLogEvent', () => ({
  default: { create: mockFleetLogCreate },
}));
vi.mock('@/models/ConfigRevision', () => ({
  default: { findOne: mockConfigFindOne, create: mockConfigCreate },
}));
vi.mock('@/models/FrpServerState', () => ({
  default: { findOne: mockFrpFindOne },
}));
vi.mock('@/models/PublicRoute', () => ({
  default: { find: mockPublicRouteFind, updateMany: mockPublicRouteUpdateMany },
}));
vi.mock('@/models/ResourcePolicy', () => ({
  default: { find: mockResourcePolicyFind },
}));
vi.mock('@/lib/fleet/orchestrators', () => ({
  getFrpOrchestrator: mockGetFrpOrchestrator,
  getNginxOrchestrator: mockGetNginxOrchestrator,
}));
vi.mock('@/lib/fleet/applyEngine', () => ({
  applyRevision: mockApplyRevision,
}));

import { GET, PATCH, DELETE } from './route';

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

const baseNode = {
  _id: 'node-1',
  name: 'Orion',
  slug: 'orion',
  status: 'unpaired',
  tunnelStatus: 'disconnected',
  tags: [],
  maintenance: { enabled: false },
  frpcConfig: {
    protocol: 'tcp',
    tlsEnabled: true,
    tlsVerify: true,
    transportEncryptionEnabled: true,
    compressionEnabled: false,
    heartbeatInterval: 30,
    heartbeatTimeout: 90,
    poolCount: 1,
    advanced: {},
  },
  proxyRules: [],
};

describe('GET /api/fleet/nodes/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
  });

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(baseNode) });
    const res = await GET(new NextRequest('http://localhost'), makeContext('node-1'));
    expect(res.status).toBe(401);
  });

  it('returns the node with computedStatus', async () => {
    mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(baseNode) });
    const res = await GET(new NextRequest('http://localhost'), makeContext('node-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.node.slug).toBe('orion');
    expect(json.computedStatus).toBe('unpaired');
  });

  it('returns 404 when not found', async () => {
    mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await GET(new NextRequest('http://localhost'), makeContext('node-1'));
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/fleet/nodes/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
    mockFrpFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        key: 'global',
        enabled: true,
        bindPort: 7000,
        subdomainHost: 'example.com',
      }),
    });
    mockConfigFindOne.mockReturnValue({
      sort: () => ({ lean: vi.fn().mockResolvedValue(null) }),
    });
    mockConfigCreate.mockResolvedValue({ _id: 'rev1' });
    mockFleetLogCreate.mockResolvedValue({});
    mockResourcePolicyFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    });
    mockPublicRouteFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    });
    mockPublicRouteUpdateMany.mockResolvedValue({ modifiedCount: 0 });
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
    const res = await PATCH(makeReq({ name: 'Updated' }), makeContext('node-1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for viewer role on PATCH', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'v', role: 'user' } });
    const res = await PATCH(makeReq({ name: 'Updated' }), makeContext('node-1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when node not found', async () => {
    mockFindById.mockResolvedValue(null);
    const res = await PATCH(makeReq({ name: 'Updated' }), makeContext('node-1'));
    expect(res.status).toBe(404);
  });

  it('updates node and saves a revision', async () => {
    mockFindById.mockResolvedValue({ ...baseNode });
    const updatedDoc = {
      ...baseNode,
      name: 'Orion II',
      toObject: () => ({ ...baseNode, name: 'Orion II' }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockFindByIdAndUpdate.mockResolvedValue(updatedDoc);

    const res = await PATCH(makeReq({ name: 'Orion II' }), makeContext('node-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.node.name).toBe('Orion II');
    expect(mockConfigCreate).toHaveBeenCalled();
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'node.update', audit: true })
    );
  });

  it('rejects invalid input with 400', async () => {
    mockFindById.mockResolvedValue({ ...baseNode });
    const res = await PATCH(
      makeReq({ frpcConfig: { protocol: 'not-a-protocol' } }),
      makeContext('node-1')
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid input');
  });

  it('does NOT auto-apply revision when FLEET_AUTO_APPLY_REVISIONS is unset', async () => {
    const prev = process.env.FLEET_AUTO_APPLY_REVISIONS;
    delete process.env.FLEET_AUTO_APPLY_REVISIONS;
    try {
      mockFindById.mockResolvedValue({ ...baseNode });
      const updatedDoc = {
        ...baseNode,
        name: 'Orion III',
        toObject: () => ({ ...baseNode, name: 'Orion III' }),
        save: vi.fn().mockResolvedValue(undefined),
      };
      mockFindByIdAndUpdate.mockResolvedValue(updatedDoc);
      mockApplyRevision.mockResolvedValue({ kind: 'frpc', reloaded: false });
      const res = await PATCH(makeReq({ name: 'Orion III' }), makeContext('node-1'));
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
      mockFindById.mockResolvedValue({ ...baseNode });
      const updatedDoc = {
        ...baseNode,
        name: 'Orion IV',
        toObject: () => ({ ...baseNode, name: 'Orion IV' }),
        save: vi.fn().mockResolvedValue(undefined),
      };
      mockFindByIdAndUpdate.mockResolvedValue(updatedDoc);
      mockApplyRevision.mockResolvedValue({ kind: 'frpc', reloaded: false });
      const res = await PATCH(makeReq({ name: 'Orion IV' }), makeContext('node-1'));
      expect(res.status).toBe(200);
      expect(mockApplyRevision).toHaveBeenCalledTimes(1);
    } finally {
      if (prev === undefined) delete process.env.FLEET_AUTO_APPLY_REVISIONS;
      else process.env.FLEET_AUTO_APPLY_REVISIONS = prev;
    }
  });

  it('returns 429 when growing proxyRules exceeds maxProxiesPerNode hard limit', async () => {
    mockFindById.mockResolvedValue({ ...baseNode, proxyRules: [] });
    mockResourcePolicyFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          scope: 'node',
          scopeId: 'node-1',
          limits: { maxProxiesPerNode: 1 },
          enforcement: { maxProxiesPerNode: 'hard' },
        },
      ]),
    });

    const res = await PATCH(
      makeReq({
        proxyRules: [
          {
            name: 'a',
            type: 'http',
            localIp: '127.0.0.1',
            localPort: 3000,
            customDomains: [],
            enabled: true,
            status: 'disabled',
          },
          {
            name: 'b',
            type: 'http',
            localIp: '127.0.0.1',
            localPort: 3001,
            customDomains: [],
            enabled: true,
            status: 'disabled',
          },
        ],
      }),
      makeContext('node-1')
    );
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toBe('Resource limit exceeded');
    expect(json.limit).toBe(1);
    expect(json.current).toBe(2);
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('allows PATCH when proxyRules count is unchanged or shrinks', async () => {
    const existingRule = {
      name: 'a',
      type: 'http',
      localIp: '127.0.0.1',
      localPort: 3000,
      customDomains: [],
      enabled: true,
      status: 'disabled' as const,
    };
    mockFindById.mockResolvedValue({
      ...baseNode,
      proxyRules: [existingRule, { ...existingRule, name: 'b', localPort: 3001 }],
    });
    mockResourcePolicyFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          scope: 'node',
          scopeId: 'node-1',
          limits: { maxProxiesPerNode: 1 },
          enforcement: { maxProxiesPerNode: 'hard' },
        },
      ]),
    });
    const updatedDoc = {
      ...baseNode,
      proxyRules: [existingRule],
      toObject: () => ({ ...baseNode, proxyRules: [existingRule] }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockFindByIdAndUpdate.mockResolvedValue(updatedDoc);

    const res = await PATCH(makeReq({ proxyRules: [existingRule] }), makeContext('node-1'));
    expect(res.status).toBe(200);
  });

  it('does not reinsert explicitly removed proxy rules from public routes', async () => {
    const removedRule = {
      name: 'web',
      type: 'http' as const,
      localIp: '127.0.0.1',
      localPort: 3000,
      customDomains: [],
      enabled: true,
      status: 'active' as const,
    };
    mockFindById.mockResolvedValue({
      ...baseNode,
      proxyRules: [removedRule],
    });
    mockPublicRouteFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: 'route-1',
          nodeId: 'node-1',
          name: 'Web',
          slug: 'web',
          domain: 'web.example.com',
          proxyRuleName: 'web',
          target: { localIp: '127.0.0.1', localPort: 3000, protocol: 'http' },
          enabled: true,
        },
      ]),
    });
    const updatedDoc = {
      ...baseNode,
      proxyRules: [],
      toObject: () => ({ ...baseNode, proxyRules: [] }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockFindByIdAndUpdate.mockResolvedValue(updatedDoc);

    const res = await PATCH(makeReq({ proxyRules: [] }), makeContext('node-1'));

    expect(res.status).toBe(200);
    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
      'node-1',
      expect.objectContaining({ proxyRules: [] }),
      { new: true }
    );
    expect(mockPublicRouteUpdateMany).toHaveBeenCalledWith(
      {
        nodeId: 'node-1',
        proxyRuleName: { $in: ['web'] },
        enabled: true,
      },
      {
        $set: expect.objectContaining({
          enabled: false,
          status: 'disabled',
          updatedBy: 'admin',
        }),
      }
    );
  });

  it('allows growing proxyRules when enforcement is soft', async () => {
    mockFindById.mockResolvedValue({ ...baseNode, proxyRules: [] });
    mockResourcePolicyFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          scope: 'node',
          scopeId: 'node-1',
          limits: { maxProxiesPerNode: 1 },
          enforcement: { maxProxiesPerNode: 'soft' },
        },
      ]),
    });
    const updatedDoc = {
      ...baseNode,
      toObject: () => ({ ...baseNode }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockFindByIdAndUpdate.mockResolvedValue(updatedDoc);

    const res = await PATCH(
      makeReq({
        proxyRules: [
          {
            name: 'a',
            type: 'http',
            localIp: '127.0.0.1',
            localPort: 3000,
            customDomains: [],
            enabled: true,
            status: 'disabled',
          },
          {
            name: 'b',
            type: 'http',
            localIp: '127.0.0.1',
            localPort: 3001,
            customDomains: [],
            enabled: true,
            status: 'disabled',
          },
        ],
      }),
      makeContext('node-1')
    );
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/fleet/nodes/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
    mockFleetLogCreate.mockResolvedValue({});
  });

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await DELETE(new NextRequest('http://localhost'), makeContext('node-1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for viewer role on DELETE', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'v', role: 'user' } });
    const res = await DELETE(new NextRequest('http://localhost'), makeContext('node-1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when not found', async () => {
    mockFindById.mockResolvedValue(null);
    const res = await DELETE(new NextRequest('http://localhost'), makeContext('node-1'));
    expect(res.status).toBe(404);
  });

  it('disables proxies, emits audit and deletes node', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const nodeDoc = {
      ...baseNode,
      proxyRules: [
        { name: 'web', enabled: true, status: 'active' },
        { name: 'ssh', enabled: true, status: 'active' },
      ],
      save: saveFn,
    };
    mockFindById.mockResolvedValue(nodeDoc);
    mockFindByIdAndDelete.mockResolvedValue(nodeDoc);

    const res = await DELETE(new NextRequest('http://localhost'), makeContext('node-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deleted).toBe(true);

    expect(nodeDoc.status).toBe('disabled');
    expect(nodeDoc.proxyRules[0].enabled).toBe(false);
    expect(nodeDoc.proxyRules[0].status).toBe('disabled');
    expect(saveFn).toHaveBeenCalled();
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'node.delete', audit: true })
    );
    expect(mockFindByIdAndDelete).toHaveBeenCalledWith('node-1');
  });
});
