/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetSession,
  mockEndpointFindById,
  mockNodeFind,
  mockNodeUpdateOne,
  mockFleetLogCreate,
  mockFleetLogFind,
  mockFleetLogCountDocuments,
  mockBusEmit,
  mockResourcePolicyFind,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockEndpointFindById: vi.fn(),
  mockNodeFind: vi.fn(),
  mockNodeUpdateOne: vi.fn(),
  mockFleetLogCreate: vi.fn(),
  mockFleetLogFind: vi.fn(),
  mockFleetLogCountDocuments: vi.fn(),
  mockBusEmit: vi.fn(),
  mockResourcePolicyFind: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/fleet/audit', () => ({
  recordAudit: (_m: unknown, input: Record<string, unknown>) =>
    mockFleetLogCreate({ ...input, audit: true, eventType: input.action }),
}));
vi.mock('@/lib/fleet/eventBus', () => ({
  fleetEventBus: { emit: mockBusEmit },
}));

vi.mock('@/models/CustomEndpoint', () => ({
  default: { findById: mockEndpointFindById },
}));
vi.mock('@/models/Node', () => ({
  default: { find: mockNodeFind, updateOne: mockNodeUpdateOne },
}));
vi.mock('@/models/FleetLogEvent', () => ({
  default: {
    create: mockFleetLogCreate,
    find: mockFleetLogFind,
    countDocuments: mockFleetLogCountDocuments,
  },
}));
vi.mock('@/models/ResourcePolicy', () => ({
  default: { find: mockResourcePolicyFind },
}));

import { POST, GET } from './route';

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/fleet/endpoint-exec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeGet(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/fleet/endpoint-exec');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

describe('POST /api/fleet/endpoint-exec', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
    mockFleetLogCreate.mockResolvedValue({});
    mockNodeUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    mockFleetLogCountDocuments.mockResolvedValue(0);
    mockResourcePolicyFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    });
    mockBusEmit.mockImplementation(() => {});
  });

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(
      makePost({ endpointId: 'e1', overrideTarget: { mode: 'fleet', nodeIds: [] } })
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 for viewer role on dispatch', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'v', role: 'user' } });
    const res = await POST(
      makePost({ endpointId: 'e1', overrideTarget: { mode: 'fleet', nodeIds: [] } })
    );
    expect(res.status).toBe(403);
  });

  it('returns 404 when the endpoint is missing', async () => {
    mockEndpointFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await POST(
      makePost({ endpointId: 'missing', overrideTarget: { mode: 'fleet', nodeIds: [] } })
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when mode is local', async () => {
    mockEndpointFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'e1',
        slug: 'my-endpoint',
        target: { mode: 'local', nodeIds: [] },
      }),
    });
    const res = await POST(makePost({ endpointId: 'e1' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/local endpoint runner/);
  });

  it('dispatches to all online/degraded/connecting nodes in fleet mode', async () => {
    mockEndpointFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'e1',
        slug: 'restart',
        target: { mode: 'local', nodeIds: [] },
      }),
    });
    mockNodeFind.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([{ _id: 'n1' }, { _id: 'n2' }, { _id: 'n3' }]),
    });

    const res = await POST(
      makePost({
        endpointId: 'e1',
        overrideTarget: { mode: 'fleet', nodeIds: [] },
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.dispatched).toEqual(['n1', 'n2', 'n3']);
    expect(json.status).toBe('queued');
    expect(mockNodeFind).toHaveBeenCalledWith({
      status: { $in: ['online', 'degraded', 'connecting'] },
    });

    // one dispatch log per node + one audit log
    const dispatchedCalls = mockFleetLogCreate.mock.calls.filter(
      ([payload]) => (payload as { eventType?: string })?.eventType === 'endpoint.dispatched'
    );
    expect(dispatchedCalls).toHaveLength(3);
    // metadata carries endpointId/slug
    expect(
      (dispatchedCalls[0][0] as { metadata?: Record<string, unknown> }).metadata?.endpointId
    ).toBe('e1');
    expect(
      (dispatchedCalls[0][0] as { metadata?: Record<string, unknown> }).metadata?.endpointSlug
    ).toBe('restart');

    // audit
    const auditCalls = mockFleetLogCreate.mock.calls.filter(
      ([payload]) =>
        (payload as { eventType?: string })?.eventType === 'endpoint.fleet_dispatch' &&
        (payload as { audit?: boolean })?.audit === true
    );
    expect(auditCalls).toHaveLength(1);

    // eventBus emitted once per node
    expect(mockBusEmit).toHaveBeenCalledTimes(3);
  });

  it('tag mode filters nodes by tag', async () => {
    mockEndpointFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'e1',
        slug: 'tagged',
        target: { mode: 'local', nodeIds: [] },
      }),
    });
    mockNodeFind.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([{ _id: 'tagged1' }, { _id: 'tagged2' }]),
    });

    const res = await POST(
      makePost({
        endpointId: 'e1',
        overrideTarget: { mode: 'tag', nodeIds: [], tag: 'prod' },
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.dispatched).toEqual(['tagged1', 'tagged2']);
    expect(mockNodeFind).toHaveBeenCalledWith({ tags: 'prod' });
  });

  it('list mode uses the provided nodeIds without any DB lookup', async () => {
    mockEndpointFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'e1',
        slug: 'list-mode',
        target: { mode: 'local', nodeIds: [] },
      }),
    });

    const res = await POST(
      makePost({
        endpointId: 'e1',
        overrideTarget: { mode: 'list', nodeIds: ['node-a', 'node-b'] },
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.dispatched).toEqual(['node-a', 'node-b']);
    expect(mockNodeFind).not.toHaveBeenCalled();
  });

  it('single mode picks the first nodeId', async () => {
    mockEndpointFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'e1',
        slug: 'single-mode',
        target: { mode: 'local', nodeIds: [] },
      }),
    });

    const res = await POST(
      makePost({
        endpointId: 'e1',
        overrideTarget: { mode: 'single', nodeIds: ['node-x', 'node-y'] },
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.dispatched).toEqual(['node-x']);
  });

  it('uses endpoint-stored target when no override supplied', async () => {
    mockEndpointFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'e1',
        slug: 'saved',
        target: { mode: 'list', nodeIds: ['stored-1'], tag: undefined },
      }),
    });

    const res = await POST(makePost({ endpointId: 'e1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.dispatched).toEqual(['stored-1']);
  });

  it('returns 429 when maxEndpointRuns hard limit is exceeded', async () => {
    mockEndpointFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'e1',
        slug: 'throttled',
        target: { mode: 'local', nodeIds: [] },
      }),
    });
    mockResourcePolicyFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          scope: 'global',
          limits: { maxEndpointRuns: 2 },
          enforcement: { maxEndpointRuns: 'hard' },
        },
      ]),
    });
    mockFleetLogCountDocuments.mockResolvedValue(10);

    const res = await POST(
      makePost({
        endpointId: 'e1',
        overrideTarget: { mode: 'list', nodeIds: ['n1'] },
      })
    );
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toBe('Resource limit exceeded');
    expect(json.limit).toBe(2);
    expect(json.current).toBe(10);

    // No dispatch events should have been created.
    const dispatchedCalls = mockFleetLogCreate.mock.calls.filter(
      ([payload]) => (payload as { eventType?: string })?.eventType === 'endpoint.dispatched'
    );
    expect(dispatchedCalls).toHaveLength(0);
  });

  it('allows dispatch when maxEndpointRuns soft limit is exceeded', async () => {
    mockEndpointFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'e1',
        slug: 'throttled-soft',
        target: { mode: 'local', nodeIds: [] },
      }),
    });
    mockResourcePolicyFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          scope: 'global',
          limits: { maxEndpointRuns: 2 },
          enforcement: { maxEndpointRuns: 'soft' },
        },
      ]),
    });
    mockFleetLogCountDocuments.mockResolvedValue(10);

    const res = await POST(
      makePost({
        endpointId: 'e1',
        overrideTarget: { mode: 'list', nodeIds: ['n1'] },
      })
    );
    expect(res.status).toBe(200);
  });
});

describe('GET /api/fleet/endpoint-exec', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
  });

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET(makeGet({ endpointId: 'e1' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when endpointId is missing', async () => {
    const res = await GET(makeGet({}));
    expect(res.status).toBe(400);
  });

  it('filters by endpointId and dispatch event types', async () => {
    mockFleetLogFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([
        { _id: 'l1', eventType: 'endpoint.dispatched', metadata: { endpointId: 'e1' } },
        { _id: 'l2', eventType: 'endpoint.succeeded', metadata: { endpointId: 'e1' } },
      ]),
    });
    const res = await GET(makeGet({ endpointId: 'e1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.events).toHaveLength(2);
    expect(mockFleetLogFind).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: { $in: ['endpoint.dispatched', 'endpoint.succeeded', 'endpoint.failed'] },
        'metadata.endpointId': 'e1',
      })
    );
  });

  it('applies since filter when provided', async () => {
    mockFleetLogFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    const iso = '2026-04-20T12:00:00.000Z';
    await GET(makeGet({ endpointId: 'e1', since: iso }));
    const callArg = mockFleetLogFind.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.createdAt).toEqual({ $gte: new Date(iso) });
  });
});
