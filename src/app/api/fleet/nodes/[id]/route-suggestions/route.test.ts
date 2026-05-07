/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetSession, mockNodeFindById, mockNodeFindOne, mockRouteFind, mockFrpFindOne } =
  vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockNodeFindById: vi.fn(),
    mockNodeFindOne: vi.fn(),
    mockRouteFind: vi.fn(),
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
    findOne: mockNodeFindOne,
  },
}));
vi.mock('@/models/PublicRoute', () => ({
  default: {
    find: mockRouteFind,
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
  return new NextRequest('http://localhost/api/fleet/nodes/orion/route-suggestions');
}

const node = {
  _id: 'node-1',
  name: 'Orion',
  slug: 'orion',
  tunnelStatus: 'connected',
  servermonBridge: {
    schemaVersion: 1,
    collectedAt: '2026-05-07T11:30:00.000Z',
    app: { running: true, port: 8912 },
    modules: {
      databases: { running: true, total: 1, runningCount: 1 },
    },
    routeCandidates: [
      {
        id: 'database:db-1',
        kind: 'database',
        module: 'databases',
        name: 'Main Mongo',
        status: 'running',
        target: { localIp: '127.0.0.1', localPort: 27017, protocol: 'tcp' },
        route: {
          eligible: true,
          templateSlug: 'generic-tcp',
          proxyRuleName: 'main-mongo',
          accessMode: 'public',
          tlsEnabled: false,
          websocketEnabled: false,
          compression: false,
          timeoutSeconds: 60,
          maxBodyMb: 32,
        },
        metadata: {
          database: {
            id: 'db-1',
            slug: 'main-mongo',
            engine: 'mongo',
            version: '8',
          },
        },
        securityNotes: ['MongoDB is reachable locally.'],
      },
    ],
  },
};

describe('GET /api/fleet/nodes/[id]/route-suggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    mockNodeFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(node) });
    mockNodeFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(node) });
    mockRouteFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    mockFrpFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ subdomainHost: 'apps.example.com' }),
    });
  });

  it('builds route suggestions when the path uses the node slug', async () => {
    const res = await GET(makeReq(), makeContext('orion'));

    expect(res.status).toBe(200);
    expect(mockNodeFindById).not.toHaveBeenCalled();
    expect(mockNodeFindOne).toHaveBeenCalledWith({ slug: 'orion' });
    expect(mockRouteFind).toHaveBeenCalledWith({ nodeId: 'node-1' });

    const json = await res.json();
    expect(json.suggestions).toHaveLength(1);
    expect(json.suggestions[0]).toMatchObject({
      id: 'database:db-1',
      title: 'MongoDB database detected',
      form: {
        nodeId: 'node-1',
        domain: 'orion-main-mongo.apps.example.com',
        target: { localIp: '127.0.0.1', localPort: 27017, protocol: 'tcp' },
      },
    });
  });
});
