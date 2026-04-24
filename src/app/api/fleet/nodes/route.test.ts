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
  mockHashPairingToken,
  mockGeneratePairingToken,
  mockApplyRevision,
  mockGetFrpOrchestrator,
  mockGetNginxOrchestrator,
  mockResourcePolicyFind,
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
  mockHashPairingToken: vi.fn(),
  mockGeneratePairingToken: vi.fn(),
  mockApplyRevision: vi.fn(),
  mockGetFrpOrchestrator: vi.fn(() => ({})),
  mockGetNginxOrchestrator: vi.fn(() => ({})),
  mockResourcePolicyFind: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/fleet/pairing', async () => {
  const actual = await vi.importActual<typeof import('@/lib/fleet/pairing')>('@/lib/fleet/pairing');
  return {
    ...actual,
    generatePairingToken: mockGeneratePairingToken,
    hashPairingToken: mockHashPairingToken,
  };
});

vi.mock('@/models/Node', async () => {
  const { NodeZodSchema } = await vi.importActual<typeof import('@/models/Node')>('@/models/Node');
  return {
    default: {
      find: mockFind,
      countDocuments: mockCountDocuments,
      findOne: mockFindOne,
      create: mockCreate,
    },
    NodeZodSchema,
  };
});

vi.mock('@/models/FleetLogEvent', () => ({
  default: { create: mockFleetLogCreate },
}));
vi.mock('@/models/ConfigRevision', () => ({
  default: {
    findOne: mockConfigFindOne,
    create: mockConfigCreate,
  },
}));
vi.mock('@/models/FrpServerState', () => ({
  default: { findOne: mockFrpFindOne },
}));
vi.mock('@/models/PublicRoute', () => ({
  default: {},
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

import { GET, POST } from './route';

function makeGetRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/fleet/nodes');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/fleet/nodes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/fleet/nodes', () => {
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

  it('returns nodes with computedStatus', async () => {
    const nodes = [
      {
        _id: '1',
        name: 'Orion',
        slug: 'orion',
        status: 'unpaired',
        tunnelStatus: 'disconnected',
        tags: [],
        maintenance: { enabled: false },
      },
    ];
    mockFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(nodes),
    });
    mockCountDocuments.mockResolvedValue(1);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.nodes).toHaveLength(1);
    expect(json.nodes[0].computedStatus).toBe('unpaired');
    expect(json.total).toBe(1);
  });

  it('applies search, status and tag filters', async () => {
    await GET(makeGetRequest({ search: 'orion', status: 'online', tag: 'prod' }));
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: expect.any(Array),
        status: 'online',
        tags: 'prod',
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
      lean: vi.fn().mockRejectedValue(new Error('db error')),
    });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
  });
});

describe('POST /api/fleet/nodes', () => {
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
    mockGeneratePairingToken.mockReturnValue('tok_abcdef01234567');
    mockHashPairingToken.mockResolvedValue('hash-xyz');
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
    mockCreate.mockImplementation(async (doc: Record<string, unknown>) => ({
      ...doc,
      _id: 'node-abc',
      toObject() {
        return { ...doc, _id: 'node-abc' };
      },
      save: vi.fn().mockResolvedValue(undefined),
      generatedToml: undefined,
    }));
  });

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makePostRequest({ name: 'Orion', slug: 'orion' }));
    expect(res.status).toBe(401);
  });

  it('rejects bad slug with 400', async () => {
    const res = await POST(makePostRequest({ name: 'Orion', slug: 'Invalid!' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid input');
  });

  it('creates a node, issues a token, stores hash, and returns token', async () => {
    const res = await POST(makePostRequest({ name: 'Orion', slug: 'orion' }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.pairingToken).toBe('tok_abcdef01234567');
    expect(json.node.slug).toBe('orion');

    expect(mockHashPairingToken).toHaveBeenCalledWith('tok_abcdef01234567');
    const createArgs = mockCreate.mock.calls[0][0];
    expect(createArgs.pairingTokenHash).toBe('hash-xyz');
    expect(createArgs.pairingTokenPrefix).toBe('tok_abcd');
    expect(createArgs.status).toBe('unpaired');
    expect(createArgs.createdBy).toBe('admin');

    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'node.create', audit: true })
    );
  });

  it('rejects duplicate slug with 400', async () => {
    mockFindOne.mockResolvedValue({ _id: 'existing', slug: 'orion' });
    const res = await POST(makePostRequest({ name: 'Orion', slug: 'orion' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('already taken');
  });

  it('returns 500 on unexpected error', async () => {
    mockFindOne.mockRejectedValue(new Error('db error'));
    const res = await POST(makePostRequest({ name: 'Orion', slug: 'orion' }));
    expect(res.status).toBe(500);
  });

  it('does NOT auto-apply revision when FLEET_AUTO_APPLY_REVISIONS is unset', async () => {
    const prev = process.env.FLEET_AUTO_APPLY_REVISIONS;
    delete process.env.FLEET_AUTO_APPLY_REVISIONS;
    try {
      mockApplyRevision.mockResolvedValue({ kind: 'frpc', reloaded: false });
      const res = await POST(makePostRequest({ name: 'Orion', slug: 'orion' }));
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
      mockApplyRevision.mockResolvedValue({ kind: 'frpc', reloaded: false });
      const res = await POST(makePostRequest({ name: 'Orion', slug: 'orion' }));
      expect(res.status).toBe(201);
      expect(mockApplyRevision).toHaveBeenCalledTimes(1);
    } finally {
      if (prev === undefined) delete process.env.FLEET_AUTO_APPLY_REVISIONS;
      else process.env.FLEET_AUTO_APPLY_REVISIONS = prev;
    }
  });

  it('returns 429 when maxAgents hard limit is exceeded', async () => {
    mockResourcePolicyFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          scope: 'global',
          limits: { maxAgents: 2 },
          enforcement: { maxAgents: 'hard' },
        },
      ]),
    });
    mockCountDocuments.mockResolvedValue(3);
    const res = await POST(makePostRequest({ name: 'Orion', slug: 'orion' }));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toBe('Resource limit exceeded');
    expect(json.limit).toBe(2);
    expect(json.current).toBe(3);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('allows creation when maxAgents soft limit is exceeded', async () => {
    mockResourcePolicyFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          scope: 'global',
          limits: { maxAgents: 2 },
          enforcement: { maxAgents: 'soft' },
        },
      ]),
    });
    mockCountDocuments.mockResolvedValue(5);
    const res = await POST(makePostRequest({ name: 'Orion', slug: 'orion' }));
    expect(res.status).toBe(201);
  });
});
