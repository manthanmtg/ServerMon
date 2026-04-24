/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetSession,
  mockFrpFindOne,
  mockFrpCreate,
  mockConfigFindOne,
  mockConfigCreate,
  mockFleetLogCreate,
  mockApplyRevision,
  mockGetFrpOrchestrator,
  mockGetNginxOrchestrator,
  mockEmit,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFrpFindOne: vi.fn(),
  mockFrpCreate: vi.fn(),
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

vi.mock('@/models/FrpServerState', () => ({
  default: { findOne: mockFrpFindOne, create: mockFrpCreate },
}));
vi.mock('@/models/ConfigRevision', () => ({
  default: { findOne: mockConfigFindOne, create: mockConfigCreate },
}));
vi.mock('@/models/FleetLogEvent', () => ({
  default: { create: mockFleetLogCreate },
}));
vi.mock('@/models/Node', () => ({
  default: {},
}));
vi.mock('@/models/PublicRoute', () => ({
  default: {},
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

import { GET, POST, PATCH } from './route';

function makeRequest(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/fleet/server', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function buildStateDoc(over: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = {
    key: 'global',
    enabled: false,
    runtimeState: 'stopped',
    bindPort: 7000,
    vhostHttpPort: 8080,
    configVersion: 0,
    activeConnections: 0,
    connectedNodeIds: [],
    ...over,
  };
  const save = vi.fn().mockResolvedValue(undefined);
  const doc: Record<string, unknown> & {
    save: typeof save;
    toObject: () => Record<string, unknown>;
  } = {
    ...data,
    save,
    toObject() {
      const { save: _s, toObject: _t, ...rest } = this as Record<string, unknown>;
      void _s;
      void _t;
      return { ...rest };
    },
  };
  return doc;
}

describe('GET /api/fleet/server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
  });

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns existing singleton', async () => {
    mockFrpFindOne.mockResolvedValue(buildStateDoc({ bindPort: 7001 }));
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.state.bindPort).toBe(7001);
    expect(mockFrpCreate).not.toHaveBeenCalled();
  });

  it('creates singleton with defaults when missing', async () => {
    mockFrpFindOne.mockResolvedValue(null);
    mockFrpCreate.mockResolvedValue(buildStateDoc());
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.state.key).toBe('global');
    expect(json.state.bindPort).toBe(7000);
    expect(mockFrpCreate).toHaveBeenCalled();
  });
});

describe('POST /api/fleet/server (toggle)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    mockConfigFindOne.mockReturnValue({
      sort: () => ({ lean: vi.fn().mockResolvedValue(null) }),
    });
    mockConfigCreate.mockResolvedValue({ _id: 'rev1' });
    mockFleetLogCreate.mockResolvedValue({});
  });

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeRequest('POST', { enabled: true }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for viewer role on toggle', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'v', role: 'user' } });
    const res = await POST(makeRequest('POST', { enabled: true }));
    expect(res.status).toBe(403);
  });

  it('returns 403 for operator role on toggle (admin-only)', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'op', role: 'operator' } });
    const res = await POST(makeRequest('POST', { enabled: true }));
    expect(res.status).toBe(403);
  });

  it('rejects invalid body with 400', async () => {
    const res = await POST(makeRequest('POST', { enabled: 'not-bool' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid input');
  });

  it('blocks disabling with active connections and no force (409)', async () => {
    mockFrpFindOne.mockResolvedValue(buildStateDoc({ enabled: true, activeConnections: 3 }));
    const res = await POST(makeRequest('POST', { enabled: false }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.blocked).toBe(true);
    expect(json.activeConnections).toBe(3);
  });

  it('allows disabling with force even with active connections', async () => {
    mockFrpFindOne.mockResolvedValue(buildStateDoc({ enabled: true, activeConnections: 3 }));
    const res = await POST(makeRequest('POST', { enabled: false, force: true }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.state.enabled).toBe(false);
    expect(json.state.runtimeState).toBe('stopping');
    expect(mockConfigCreate).toHaveBeenCalled();
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'frps.toggle', audit: true })
    );
  });

  it('toggles enabled=true, renders config, records audit', async () => {
    mockFrpFindOne.mockResolvedValue(buildStateDoc());
    const res = await POST(makeRequest('POST', { enabled: true }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.state.enabled).toBe(true);
    expect(json.state.runtimeState).toBe('starting');
    expect(mockConfigCreate).toHaveBeenCalled();
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'frps.toggle', audit: true })
    );
  });

  it('does NOT auto-apply revision when FLEET_AUTO_APPLY_REVISIONS is unset', async () => {
    const prev = process.env.FLEET_AUTO_APPLY_REVISIONS;
    delete process.env.FLEET_AUTO_APPLY_REVISIONS;
    try {
      mockFrpFindOne.mockResolvedValue(buildStateDoc());
      mockApplyRevision.mockResolvedValue({ kind: 'frps', reloaded: false });
      const res = await POST(makeRequest('POST', { enabled: true }));
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
      mockFrpFindOne.mockResolvedValue(buildStateDoc());
      mockApplyRevision.mockResolvedValue({ kind: 'frps', reloaded: false });
      const res = await POST(makeRequest('POST', { enabled: true }));
      expect(res.status).toBe(200);
      expect(mockApplyRevision).toHaveBeenCalledTimes(1);
    } finally {
      if (prev === undefined) delete process.env.FLEET_AUTO_APPLY_REVISIONS;
      else process.env.FLEET_AUTO_APPLY_REVISIONS = prev;
    }
  });

  it('emits frp.state_change with new enabled + runtimeState on toggle', async () => {
    mockFrpFindOne.mockResolvedValue(buildStateDoc());
    const res = await POST(makeRequest('POST', { enabled: true }));
    expect(res.status).toBe(200);
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'frp.state_change',
        at: expect.any(String),
        data: expect.objectContaining({
          enabled: true,
          runtimeState: 'starting',
        }),
      })
    );
  });

  it('emits frp.state_change when disabling with force', async () => {
    mockFrpFindOne.mockResolvedValue(buildStateDoc({ enabled: true, activeConnections: 3 }));
    const res = await POST(makeRequest('POST', { enabled: false, force: true }));
    expect(res.status).toBe(200);
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'frp.state_change',
        data: expect.objectContaining({
          enabled: false,
          runtimeState: 'stopping',
        }),
      })
    );
  });

  it('does NOT emit frp.state_change when toggle is blocked (409)', async () => {
    mockFrpFindOne.mockResolvedValue(buildStateDoc({ enabled: true, activeConnections: 3 }));
    const res = await POST(makeRequest('POST', { enabled: false }));
    expect(res.status).toBe(409);
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/fleet/server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    mockConfigFindOne.mockReturnValue({
      sort: () => ({ lean: vi.fn().mockResolvedValue(null) }),
    });
    mockConfigCreate.mockResolvedValue({ _id: 'rev1' });
    mockFleetLogCreate.mockResolvedValue({});
  });

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await PATCH(makeRequest('PATCH', { bindPort: 7001 }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for viewer role on patch', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'v', role: 'user' } });
    const res = await PATCH(makeRequest('PATCH', { bindPort: 7001 }));
    expect(res.status).toBe(403);
  });

  it('updates fields, re-renders config, saves revision', async () => {
    mockFrpFindOne.mockResolvedValue(buildStateDoc());
    const res = await PATCH(
      makeRequest('PATCH', {
        bindPort: 7001,
        vhostHttpPort: 8081,
        subdomainHost: 'example.com',
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.state.bindPort).toBe(7001);
    expect(json.state.vhostHttpPort).toBe(8081);
    expect(json.state.subdomainHost).toBe('example.com');
    expect(mockConfigCreate).toHaveBeenCalled();
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'frps.update', audit: true })
    );
  });

  it('rejects invalid ports with 400', async () => {
    const res = await PATCH(makeRequest('PATCH', { bindPort: -1 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid input');
  });

  it('does NOT auto-apply revision when FLEET_AUTO_APPLY_REVISIONS is unset', async () => {
    const prev = process.env.FLEET_AUTO_APPLY_REVISIONS;
    delete process.env.FLEET_AUTO_APPLY_REVISIONS;
    try {
      mockFrpFindOne.mockResolvedValue(buildStateDoc());
      mockApplyRevision.mockResolvedValue({ kind: 'frps', reloaded: false });
      const res = await PATCH(makeRequest('PATCH', { bindPort: 7001 }));
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
      mockFrpFindOne.mockResolvedValue(buildStateDoc());
      mockApplyRevision.mockResolvedValue({ kind: 'frps', reloaded: false });
      const res = await PATCH(makeRequest('PATCH', { bindPort: 7002 }));
      expect(res.status).toBe(200);
      expect(mockApplyRevision).toHaveBeenCalledTimes(1);
    } finally {
      if (prev === undefined) delete process.env.FLEET_AUTO_APPLY_REVISIONS;
      else process.env.FLEET_AUTO_APPLY_REVISIONS = prev;
    }
  });
});
