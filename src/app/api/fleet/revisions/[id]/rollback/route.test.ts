/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetSession,
  mockRevFindById,
  mockFrpFindOne,
  mockNodeFindById,
  mockRouteFindById,
  mockConfigFindOne,
  mockConfigCreate,
  mockFleetLogCreate,
  mockApplyRevision,
  mockGetFrpOrchestrator,
  mockGetNginxOrchestrator,
  mockEmit,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRevFindById: vi.fn(),
  mockFrpFindOne: vi.fn(),
  mockNodeFindById: vi.fn(),
  mockRouteFindById: vi.fn(),
  mockConfigFindOne: vi.fn(),
  mockConfigCreate: vi.fn(),
  mockFleetLogCreate: vi.fn(),
  mockApplyRevision: vi.fn(),
  mockGetFrpOrchestrator: vi.fn(() => ({})),
  mockGetNginxOrchestrator: vi.fn(() => ({})),
  mockEmit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));

vi.mock('@/models/ConfigRevision', () => ({
  default: {
    findById: mockRevFindById,
    findOne: mockConfigFindOne,
    create: mockConfigCreate,
  },
}));
vi.mock('@/models/FrpServerState', () => ({
  default: { findOne: mockFrpFindOne },
}));
vi.mock('@/models/Node', () => ({
  default: { findById: mockNodeFindById },
}));
vi.mock('@/models/PublicRoute', () => ({
  default: { findById: mockRouteFindById },
}));
vi.mock('@/models/FleetLogEvent', () => ({
  default: { create: mockFleetLogCreate },
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

import { POST } from './route';

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/fleet/revisions/r1/rollback', {
    method: 'POST',
  });
}

describe('POST /api/fleet/revisions/[id]/rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
    mockFleetLogCreate.mockResolvedValue({});
    mockConfigFindOne.mockReturnValue({
      sort: () => ({ lean: vi.fn().mockResolvedValue(null) }),
    });
    mockConfigCreate.mockResolvedValue({ _id: 'newrev' });
    mockApplyRevision.mockResolvedValue({ kind: 'frps', reloaded: false });
  });

  it('returns 401 without session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeReq(), ctx('r1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for viewer role', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'v', role: 'user' } });
    const res = await POST(makeReq(), ctx('r1'));
    expect(res.status).toBe(403);
  });

  it('returns 403 for operator role on rollback (admin-only)', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'op', role: 'operator' } });
    const res = await POST(makeReq(), ctx('r1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when revision not found', async () => {
    mockRevFindById.mockResolvedValue(null);
    const res = await POST(makeReq(), ctx('r1'));
    expect(res.status).toBe(404);
  });

  it('rolls back frps revision and writes new revision', async () => {
    const revDoc: {
      _id: string;
      kind: string;
      structured: Record<string, unknown>;
      save: ReturnType<typeof vi.fn>;
      rolledBackAt?: Date;
    } = {
      _id: 'r1',
      kind: 'frps',
      structured: { bindPort: 7111, vhostHttpPort: 8080, subdomainHost: 'x.example' },
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockRevFindById.mockResolvedValue(revDoc);
    const stateDoc = {
      bindPort: 7000,
      vhostHttpPort: 8080,
      subdomainHost: undefined,
      toObject: () => ({ bindPort: 7111, vhostHttpPort: 8080 }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockFrpFindOne.mockResolvedValue(stateDoc);

    const res = await POST(makeReq(), ctx('r1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rollbackRevision).toBeDefined();
    expect(stateDoc.bindPort).toBe(7111);
    expect(revDoc.rolledBackAt instanceof Date).toBe(true);
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'revision.rollback' })
    );
  });

  it('rolls back frpc revision and updates node', async () => {
    const revDoc = {
      _id: 'r1',
      kind: 'frpc',
      targetId: 'n1',
      structured: {
        slug: 'node-one',
        frpcConfig: { protocol: 'tcp' },
        proxyRules: [],
      },
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockRevFindById.mockResolvedValue(revDoc);
    const nodeDoc = {
      _id: 'n1',
      slug: 'old',
      frpcConfig: {},
      proxyRules: [],
      toObject: () => ({ _id: 'n1', slug: 'node-one' }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockNodeFindById.mockResolvedValue(nodeDoc);
    mockFrpFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ bindPort: 7000, subdomainHost: 'hub' }),
    });

    const res = await POST(makeReq(), ctx('r1'));
    expect(res.status).toBe(200);
    expect(nodeDoc.slug).toBe('node-one');
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'revision.rollback',
        nodeId: 'n1',
      })
    );
  });

  it('rolls back nginx revision and updates route', async () => {
    const revDoc = {
      _id: 'r1',
      kind: 'nginx',
      targetId: 'route1',
      structured: {
        domain: 'x.example.com',
        path: '/',
        tlsEnabled: true,
        http2Enabled: true,
        websocketEnabled: false,
        maxBodyMb: 32,
        timeoutSeconds: 60,
        compression: true,
        accessMode: 'servermon_auth',
        headers: {},
      },
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockRevFindById.mockResolvedValue(revDoc);
    const routeDoc = {
      _id: 'route1',
      domain: 'old.example.com',
      path: '/',
      tlsEnabled: false,
      http2Enabled: false,
      websocketEnabled: false,
      maxBodyMb: 16,
      timeoutSeconds: 30,
      compression: false,
      accessMode: 'public',
      headers: {},
      slug: 'r-slug',
      toObject: () => ({ _id: 'route1', domain: 'x.example.com' }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockRouteFindById.mockResolvedValue(routeDoc);
    mockFrpFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ vhostHttpPort: 8080 }),
    });

    const res = await POST(makeReq(), ctx('r1'));
    expect(res.status).toBe(200);
    expect(routeDoc.domain).toBe('x.example.com');
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'revision.rollback',
        routeId: 'route1',
      })
    );
  });

  it('returns 500 on unexpected error', async () => {
    mockRevFindById.mockRejectedValue(new Error('db'));
    const res = await POST(makeReq(), ctx('r1'));
    expect(res.status).toBe(500);
  });

  it('emits revision.applied on frps rollback', async () => {
    const revDoc: {
      _id: string;
      kind: string;
      structured: Record<string, unknown>;
      save: ReturnType<typeof vi.fn>;
      rolledBackAt?: Date;
    } = {
      _id: 'r1',
      kind: 'frps',
      structured: { bindPort: 7111 },
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockRevFindById.mockResolvedValue(revDoc);
    const stateDoc = {
      bindPort: 7000,
      vhostHttpPort: 8080,
      subdomainHost: undefined,
      toObject: () => ({ bindPort: 7111, vhostHttpPort: 8080 }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockFrpFindOne.mockResolvedValue(stateDoc);

    const res = await POST(makeReq(), ctx('r1'));
    expect(res.status).toBe(200);
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'revision.applied',
        at: expect.any(String),
        data: expect.objectContaining({ kind: 'frps', rolledBackFrom: 'r1' }),
      })
    );
  });

  it('emits revision.applied on frpc rollback with nodeId', async () => {
    const revDoc = {
      _id: 'r1',
      kind: 'frpc',
      targetId: 'n1',
      structured: {
        slug: 'node-one',
        frpcConfig: { protocol: 'tcp' },
        proxyRules: [],
      },
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockRevFindById.mockResolvedValue(revDoc);
    const nodeDoc = {
      _id: 'n1',
      slug: 'old',
      frpcConfig: {},
      proxyRules: [],
      toObject: () => ({ _id: 'n1', slug: 'node-one' }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockNodeFindById.mockResolvedValue(nodeDoc);
    mockFrpFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ bindPort: 7000, subdomainHost: 'hub' }),
    });

    const res = await POST(makeReq(), ctx('r1'));
    expect(res.status).toBe(200);
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'revision.applied',
        nodeId: 'n1',
        data: expect.objectContaining({ kind: 'frpc', rolledBackFrom: 'r1' }),
      })
    );
  });

  it('emits revision.applied on nginx rollback with routeId', async () => {
    const revDoc = {
      _id: 'r1',
      kind: 'nginx',
      targetId: 'route1',
      structured: {
        domain: 'x.example.com',
        path: '/',
        tlsEnabled: true,
        http2Enabled: true,
        websocketEnabled: false,
        maxBodyMb: 32,
        timeoutSeconds: 60,
        compression: true,
        accessMode: 'servermon_auth',
        headers: {},
      },
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockRevFindById.mockResolvedValue(revDoc);
    const routeDoc = {
      _id: 'route1',
      domain: 'old.example.com',
      path: '/',
      tlsEnabled: false,
      http2Enabled: false,
      websocketEnabled: false,
      maxBodyMb: 16,
      timeoutSeconds: 30,
      compression: false,
      accessMode: 'public',
      headers: {},
      slug: 'r-slug',
      toObject: () => ({ _id: 'route1', domain: 'x.example.com' }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockRouteFindById.mockResolvedValue(routeDoc);
    mockFrpFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ vhostHttpPort: 8080 }),
    });

    const res = await POST(makeReq(), ctx('r1'));
    expect(res.status).toBe(200);
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'revision.applied',
        routeId: 'route1',
        data: expect.objectContaining({ kind: 'nginx', rolledBackFrom: 'r1' }),
      })
    );
  });

  it('always calls applyRevision on rollback regardless of FLEET_AUTO_APPLY_REVISIONS', async () => {
    const prev = process.env.FLEET_AUTO_APPLY_REVISIONS;
    delete process.env.FLEET_AUTO_APPLY_REVISIONS;
    try {
      const revDoc: {
        _id: string;
        kind: string;
        structured: Record<string, unknown>;
        save: ReturnType<typeof vi.fn>;
        rolledBackAt?: Date;
      } = {
        _id: 'r1',
        kind: 'frps',
        structured: { bindPort: 7111, vhostHttpPort: 8080, subdomainHost: 'x.example' },
        save: vi.fn().mockResolvedValue(undefined),
      };
      mockRevFindById.mockResolvedValue(revDoc);
      const stateDoc = {
        bindPort: 7000,
        vhostHttpPort: 8080,
        subdomainHost: undefined,
        toObject: () => ({ bindPort: 7111, vhostHttpPort: 8080 }),
        save: vi.fn().mockResolvedValue(undefined),
      };
      mockFrpFindOne.mockResolvedValue(stateDoc);

      const res = await POST(makeReq(), ctx('r1'));
      expect(res.status).toBe(200);
      expect(mockApplyRevision).toHaveBeenCalledTimes(1);
    } finally {
      if (prev !== undefined) process.env.FLEET_AUTO_APPLY_REVISIONS = prev;
    }
  });
});
