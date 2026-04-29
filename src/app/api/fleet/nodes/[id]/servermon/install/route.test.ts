/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetSession,
  mockNodeFindById,
  mockNodeUpdateOne,
  mockRouteFindOne,
  mockFrpFindOne,
  mockStoreCommandSecret,
  mockFleetLogCreate,
  mockRecordAudit,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockNodeFindById: vi.fn(),
  mockNodeUpdateOne: vi.fn(),
  mockRouteFindOne: vi.fn(),
  mockFrpFindOne: vi.fn(),
  mockStoreCommandSecret: vi.fn(),
  mockFleetLogCreate: vi.fn(),
  mockRecordAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/fleet/commandSecrets', () => ({
  storeCommandSecret: mockStoreCommandSecret,
}));
vi.mock('@/lib/fleet/audit', () => ({
  recordAudit: mockRecordAudit,
}));
vi.mock('@/models/Node', () => ({
  default: {
    findById: mockNodeFindById,
    updateOne: mockNodeUpdateOne,
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
vi.mock('@/models/FleetLogEvent', () => ({
  default: {
    create: mockFleetLogCreate,
  },
}));

import { POST } from './route';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/fleet/nodes/node-1/servermon/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeContext(id = 'node-1') {
  return { params: Promise.resolve({ id }) };
}

const onlineNode = {
  _id: 'node-1',
  name: 'Orion',
  slug: 'orion',
  tunnelStatus: 'connected',
  status: 'online',
  servermon: { installed: false },
};

describe('POST /api/fleet/nodes/[id]/servermon/install', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    mockNodeFindById.mockResolvedValue(onlineNode);
    mockNodeUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    mockRouteFindOne.mockResolvedValue(null);
    mockFrpFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ subdomainHost: 'ultron.manthanby.cv' }),
    });
    mockStoreCommandSecret.mockResolvedValue(undefined);
    mockFleetLogCreate.mockResolvedValue({});
    mockRecordAudit.mockResolvedValue(undefined);
  });

  it('queues install-servermon with encrypted secret reference only', async () => {
    const res = await POST(
      makeReq({
        mongoUri: 'mongodb://user:pass@db/servermon',
        port: 8912,
        createPublicRoute: true,
      }),
      makeContext()
    );

    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.queued).toBe(true);
    expect(json.routeIntent.domain).toBe('orion-servermon.ultron.manthanby.cv');

    expect(mockStoreCommandSecret).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 'node-1',
        payload: { mongoUri: 'mongodb://user:pass@db/servermon' },
      })
    );
    const update = mockNodeUpdateOne.mock.calls[0][1] as {
      $push: { pendingCommands: { args: Record<string, unknown> } };
    };
    expect(update.$push.pendingCommands.args.mongoUri).toBeUndefined();
    expect(update.$push.pendingCommands.args.secretRef).toBe(json.commandId);
    expect(JSON.stringify(update)).not.toContain('mongodb://user:pass@db/servermon');
  });

  it('rejects non-admin users', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'op', role: 'operator' } });
    const res = await POST(makeReq({ mongoUri: 'mongodb://db/servermon' }), makeContext());
    expect(res.status).toBe(403);
  });

  it('returns conflict before queueing when route domain is already configured', async () => {
    mockRouteFindOne.mockResolvedValue({ _id: 'route-1' });
    const res = await POST(
      makeReq({
        mongoUri: 'mongodb://db/servermon',
        createPublicRoute: true,
        routeDomain: 'orion-servermon.ultron.manthanby.cv',
      }),
      makeContext()
    );

    expect(res.status).toBe(409);
    expect(mockNodeUpdateOne).not.toHaveBeenCalled();
    expect(mockStoreCommandSecret).not.toHaveBeenCalled();
  });
});
