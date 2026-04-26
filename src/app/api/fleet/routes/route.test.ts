/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetSession,
  mockFind,
  mockCountDocuments,
  mockFindOne,
  mockCreate,
  mockFrpFindOne,
  mockConfigFindOne,
  mockConfigCreate,
  mockFleetLogCreate,
  mockResolveDomain,
  mockApplyRevision,
  mockGetFrpOrchestrator,
  mockGetNginxOrchestrator,
  mockNodeFindById,
  mockResourcePolicyFind,
  mockEnsureLetsEncryptCertificate,
  mockProbePublicRoute,
  mockShouldUseLetsEncrypt,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFind: vi.fn(),
  mockCountDocuments: vi.fn(),
  mockFindOne: vi.fn(),
  mockCreate: vi.fn(),
  mockFrpFindOne: vi.fn(),
  mockConfigFindOne: vi.fn(),
  mockConfigCreate: vi.fn(),
  mockFleetLogCreate: vi.fn(),
  mockResolveDomain: vi.fn(),
  mockApplyRevision: vi.fn(() => Promise.resolve({ kind: 'mock', reloaded: false })),
  mockGetFrpOrchestrator: vi.fn(() => ({})),
  mockGetNginxOrchestrator: vi.fn(() => ({})),
  mockNodeFindById: vi.fn(),
  mockResourcePolicyFind: vi.fn(),
  mockEnsureLetsEncryptCertificate: vi.fn(() => Promise.resolve({ ok: true, tlsStatus: 'ok' })),
  mockProbePublicRoute: vi.fn(() => Promise.resolve({
    status: 'active',
    dnsStatus: 'ok',
    tlsStatus: 'ok',
    healthStatus: 'healthy',
    lastCheckedAt: new Date(),
  })),
  mockShouldUseLetsEncrypt: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/fleet/dns', () => ({
  resolveDomain: mockResolveDomain,
}));

vi.mock('@/models/PublicRoute', async () => {
  const { PublicRouteZodSchema } =
    await vi.importActual<typeof import('@/models/PublicRoute')>('@/models/PublicRoute');
  return {
    default: {
      find: mockFind,
      countDocuments: mockCountDocuments,
      findOne: mockFindOne,
      create: mockCreate,
    },
    PublicRouteZodSchema,
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
vi.mock('@/models/Node', () => ({
  default: { findById: mockNodeFindById },
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
vi.mock('@/lib/fleet/publicRouteLifecycle', () => ({
  ensureLetsEncryptCertificate: mockEnsureLetsEncryptCertificate,
  probePublicRoute: mockProbePublicRoute,
  shouldUseLetsEncrypt: mockShouldUseLetsEncrypt,
}));

import { GET, POST } from './route';

function makeGetRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/fleet/routes');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/fleet/routes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validRouteInput = {
  name: 'Docs',
  slug: 'docs',
  domain: 'docs.example.com',
  path: '/',
  nodeId: 'node-1',
  proxyRuleName: 'web',
  target: { localIp: '127.0.0.1', localPort: 3000, protocol: 'http' },
};

describe('GET /api/fleet/routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
    mockFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    mockCountDocuments.mockResolvedValue(0);
  });

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it('returns routes and total', async () => {
    const routes = [{ _id: '1', name: 'A', slug: 'a' }];
    mockFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(routes),
    });
    mockCountDocuments.mockResolvedValue(1);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.routes).toHaveLength(1);
    expect(json.total).toBe(1);
  });

  it('applies filter params', async () => {
    await GET(
      makeGetRequest({
        search: 'doc',
        domain: 'docs.example.com',
        nodeId: 'node-1',
        status: 'active',
      })
    );
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: expect.any(Array),
        domain: 'docs.example.com',
        nodeId: 'node-1',
        status: 'active',
      })
    );
  });

  it('caps limit at 200', async () => {
    const chain = {
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    };
    mockFind.mockReturnValue(chain);
    await GET(makeGetRequest({ limit: '9999' }));
    expect(chain.limit).toHaveBeenCalledWith(200);
  });

  it('returns 500 on db error', async () => {
    mockFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockRejectedValue(new Error('db')),
    });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
  });
});

describe('POST /api/fleet/routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
    mockFindOne.mockResolvedValue(null);
    mockCountDocuments.mockResolvedValue(0);
    mockResourcePolicyFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    });
    mockResolveDomain.mockResolvedValue({ ips: ['203.0.113.10'] });
    mockShouldUseLetsEncrypt.mockReturnValue(false);
    mockEnsureLetsEncryptCertificate.mockResolvedValue({ ok: true, tlsStatus: 'active' });
    mockProbePublicRoute.mockResolvedValue({
      status: 'active',
      dnsStatus: 'ok',
      tlsStatus: 'active',
      healthStatus: 'healthy',
      lastCheckedAt: new Date('2026-04-25T00:00:00.000Z'),
    });
    mockFrpFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        key: 'global',
        vhostHttpPort: 8080,
        bindPort: 7000,
        subdomainHost: 'hub.example.com',
      }),
    });
    mockConfigFindOne.mockReturnValue({
      sort: () => ({ lean: vi.fn().mockResolvedValue(null) }),
    });
    mockConfigCreate.mockResolvedValue({ _id: 'rev1' });
    mockFleetLogCreate.mockResolvedValue({});
    mockNodeFindById.mockResolvedValue({
      _id: 'node-1',
      slug: 'edge-01',
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
      proxyRules: [
        {
          name: 'web',
          type: 'http',
          localIp: '127.0.0.1',
          localPort: 3000,
          customDomains: ['docs.example.com'],
          enabled: true,
          status: 'disabled',
        },
      ],
      save: vi.fn().mockResolvedValue(undefined),
    });
    mockCreate.mockImplementation(async (doc: Record<string, unknown>) => ({
      ...doc,
      _id: 'route-abc',
      save: vi.fn().mockResolvedValue(undefined),
      toObject() {
        return { ...doc, _id: 'route-abc' };
      },
    }));
  });

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makePostRequest(validRouteInput));
    expect(res.status).toBe(401);
  });

  it('returns 403 for viewer role on create', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'v', role: 'user' } });
    const res = await POST(makePostRequest(validRouteInput));
    expect(res.status).toBe(403);
  });

  it('rejects invalid body with 400', async () => {
    const res = await POST(makePostRequest({ ...validRouteInput, slug: 'Invalid!' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid input');
  });

  it('rejects unsafe public route domains', async () => {
    const res = await POST(makePostRequest({ ...validRouteInput, domain: '*.example.com' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/hostname/i);
  });

  it('returns 409 on duplicate slug', async () => {
    mockFindOne.mockResolvedValueOnce({ _id: 'existing' });
    const res = await POST(makePostRequest(validRouteInput));
    expect(res.status).toBe(409);
  });

  it('returns 409 on duplicate domain', async () => {
    mockFindOne
      .mockResolvedValueOnce(null) // slug check
      .mockResolvedValueOnce({ _id: 'existing-domain' }); // domain check
    const res = await POST(makePostRequest(validRouteInput));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/domain/i);
  });

  it('creates route with dnsStatus=ok when DNS resolves', async () => {
    mockResolveDomain.mockResolvedValue({ ips: ['203.0.113.10'] });
    const res = await POST(makePostRequest(validRouteInput));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.route.slug).toBe('docs');

    const createArgs = mockCreate.mock.calls[0][0];
    expect(createArgs.dnsStatus).toBe('ok');
    expect(createArgs.status).toBe('pending_dns');
    expect(createArgs.createdBy).toBe('admin');

    expect(mockConfigCreate).toHaveBeenCalled();
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'route.create', audit: true })
    );
  });

  it('creates route with dnsStatus=missing when DNS returns no IPs', async () => {
    mockResolveDomain.mockResolvedValue({ ips: [] });
    const res = await POST(makePostRequest(validRouteInput));
    expect(res.status).toBe(201);
    const createArgs = mockCreate.mock.calls[0][0];
    expect(createArgs.dnsStatus).toBe('missing');
  });

  it('returns 500 on unexpected error', async () => {
    mockFindOne.mockRejectedValue(new Error('db'));
    const res = await POST(makePostRequest(validRouteInput));
    expect(res.status).toBe(500);
  });

  it('does NOT auto-apply revision when FLEET_AUTO_APPLY_REVISIONS is unset', async () => {
    const prev = process.env.FLEET_AUTO_APPLY_REVISIONS;
    delete process.env.FLEET_AUTO_APPLY_REVISIONS;
    try {
      mockApplyRevision.mockResolvedValue({ kind: 'nginx', reloaded: true });
      const res = await POST(makePostRequest(validRouteInput));
      expect(res.status).toBe(201);
      expect(mockApplyRevision).not.toHaveBeenCalled();
    } finally {
      if (prev !== undefined) process.env.FLEET_AUTO_APPLY_REVISIONS = prev;
    }
  });

  it('auto-applies revision when FLEET_AUTO_APPLY_REVISIONS=true', async () => {
    const prev = process.env.FLEET_AUTO_APPLY_REVISIONS;
    process.env.FLEET_AUTO_APPLY_REVISIONS = 'true';
    try {
      mockApplyRevision.mockResolvedValue({ kind: 'nginx', reloaded: true });
      const res = await POST(makePostRequest(validRouteInput));
      expect(res.status).toBe(201);
      expect(mockApplyRevision).toHaveBeenCalledTimes(1);
    } finally {
      if (prev === undefined) delete process.env.FLEET_AUTO_APPLY_REVISIONS;
      else process.env.FLEET_AUTO_APPLY_REVISIONS = prev;
    }
  });

  it('bootstraps letsencrypt and probes route during auto-apply', async () => {
    const prev = process.env.FLEET_AUTO_APPLY_REVISIONS;
    process.env.FLEET_AUTO_APPLY_REVISIONS = 'true';
    try {
      mockShouldUseLetsEncrypt.mockReturnValue(true);
      mockApplyRevision.mockResolvedValue({ kind: 'nginx', reloaded: true });
      const res = await POST(
        makePostRequest({
          ...validRouteInput,
          tlsEnabled: true,
          tlsProvider: 'letsencrypt',
          websocketEnabled: true,
          timeoutSeconds: 300,
        })
      );
      expect(res.status).toBe(201);
      expect(mockEnsureLetsEncryptCertificate).toHaveBeenCalledWith(
        expect.objectContaining({ domain: 'docs.example.com' }),
        expect.objectContaining({
          bootstrapSnippet: expect.stringContaining('listen 80;'),
        })
      );
      expect(mockProbePublicRoute).toHaveBeenCalledWith(
        expect.objectContaining({ domain: 'docs.example.com' })
      );
    } finally {
      if (prev === undefined) delete process.env.FLEET_AUTO_APPLY_REVISIONS;
      else process.env.FLEET_AUTO_APPLY_REVISIONS = prev;
    }
  });

  it('returns 400 when Node not found', async () => {
    mockNodeFindById.mockResolvedValue(null);
    const res = await POST(makePostRequest(validRouteInput));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Node not found');
  });

  it('auto-inserts proxy rule when proxyRuleName missing on node', async () => {
    const nodeSave = vi.fn().mockResolvedValue(undefined);
    const nodeDoc = {
      _id: 'node-1',
      slug: 'edge-01',
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
      proxyRules: [
        {
          name: 'api',
          type: 'http',
          localIp: '127.0.0.1',
          localPort: 4000,
          customDomains: [],
          enabled: true,
          status: 'disabled',
        },
      ],
      save: nodeSave,
    };
    mockNodeFindById.mockResolvedValue(nodeDoc);

    const res = await POST(makePostRequest(validRouteInput));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.autoInsertedProxy).toBe(true);

    // New rule appended with correct identity/config.
    expect(nodeDoc.proxyRules).toHaveLength(2);
    const inserted = nodeDoc.proxyRules[1];
    expect(inserted.name).toBe('web');
    expect(inserted.type).toBe('http');
    expect(inserted.localIp).toBe('127.0.0.1');
    expect(inserted.localPort).toBe(3000);
    expect(inserted.enabled).toBe(true);
    expect(nodeSave).toHaveBeenCalled();

    // Two revisions created: one for frpc (node), one for nginx (route).
    expect(mockConfigCreate).toHaveBeenCalledTimes(2);
    const kinds = mockConfigCreate.mock.calls.map((c) => (c[0] as { kind: string }).kind);
    expect(kinds).toContain('frpc');
    expect(kinds).toContain('nginx');
  });

  it('auto-inserts tcp proxy rule with remotePort when protocol=tcp', async () => {
    const nodeSave = vi.fn().mockResolvedValue(undefined);
    const nodeDoc = {
      _id: 'node-1',
      slug: 'edge-01',
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
      save: nodeSave,
    };
    mockNodeFindById.mockResolvedValue(nodeDoc);

    const tcpInput = {
      ...validRouteInput,
      proxyRuleName: 'raw-tcp',
      target: { localIp: '127.0.0.1', localPort: 5432, protocol: 'tcp' as const },
    };
    const res = await POST(makePostRequest(tcpInput));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.autoInsertedProxy).toBe(true);

    const inserted = nodeDoc.proxyRules[0] as {
      name: string;
      type: string;
      remotePort?: number;
      customDomains: string[];
    };
    expect(inserted.type).toBe('tcp');
    expect(inserted.remotePort).toBeGreaterThanOrEqual(9000);
    expect(inserted.remotePort).toBeLessThan(19000);
    expect(inserted.customDomains).toEqual([]);
  });

  it('returns 429 when maxPublicRoutes hard limit is exceeded', async () => {
    mockResourcePolicyFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          scope: 'global',
          limits: { maxPublicRoutes: 1 },
          enforcement: { maxPublicRoutes: 'hard' },
        },
      ]),
    });
    mockCountDocuments.mockResolvedValue(5);
    const res = await POST(makePostRequest(validRouteInput));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toBe('Resource limit exceeded');
    expect(json.limit).toBe(1);
    expect(json.current).toBe(5);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('allows creation when maxPublicRoutes soft limit is exceeded', async () => {
    mockResourcePolicyFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          scope: 'global',
          limits: { maxPublicRoutes: 1 },
          enforcement: { maxPublicRoutes: 'soft' },
        },
      ]),
    });
    mockCountDocuments.mockResolvedValue(5);
    const res = await POST(makePostRequest(validRouteInput));
    expect(res.status).toBe(201);
  });

  it('does NOT modify proxyRules when proxyRuleName already exists on node', async () => {
    const nodeSave = vi.fn().mockResolvedValue(undefined);
    const nodeDoc = {
      _id: 'node-1',
      slug: 'edge-01',
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
      proxyRules: [
        {
          name: 'web',
          type: 'http',
          localIp: '127.0.0.1',
          localPort: 3000,
          customDomains: ['docs.example.com'],
          enabled: true,
          status: 'disabled',
        },
      ],
      save: nodeSave,
    };
    mockNodeFindById.mockResolvedValue(nodeDoc);

    const res = await POST(makePostRequest(validRouteInput));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.autoInsertedProxy).toBe(false);

    expect(nodeDoc.proxyRules).toHaveLength(1);
    expect(nodeSave).not.toHaveBeenCalled();
    // Only nginx revision should have been saved, not frpc.
    const kinds = mockConfigCreate.mock.calls.map((c) => (c[0] as { kind: string }).kind);
    expect(kinds).not.toContain('frpc');
    expect(kinds).toContain('nginx');
  });
});
