/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetSession,
  mockRouteUpdateMany,
  mockNodeFindById,
  mockNodeFind,
  mockNodeUpdateMany,
  mockNodeCount,
  mockAgentUpdateMany,
  mockFrpUpdateOne,
  mockFleetLogCreate,
  mockGeneratePairingToken,
  mockHashPairingToken,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRouteUpdateMany: vi.fn(),
  mockNodeFindById: vi.fn(),
  mockNodeFind: vi.fn(),
  mockNodeUpdateMany: vi.fn(),
  mockNodeCount: vi.fn(),
  mockAgentUpdateMany: vi.fn(),
  mockFrpUpdateOne: vi.fn(),
  mockFleetLogCreate: vi.fn(),
  mockGeneratePairingToken: vi.fn(),
  mockHashPairingToken: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/fleet/pairing', () => ({
  generatePairingToken: mockGeneratePairingToken,
  hashPairingToken: mockHashPairingToken,
}));
vi.mock('@/lib/fleet/audit', () => ({
  recordAudit: (_m: unknown, input: Record<string, unknown>) =>
    mockFleetLogCreate({ ...input, audit: true, eventType: input.action }),
}));

vi.mock('@/models/PublicRoute', () => ({
  default: { updateMany: mockRouteUpdateMany },
}));
vi.mock('@/models/Node', () => ({
  default: {
    findById: mockNodeFindById,
    find: mockNodeFind,
    updateMany: mockNodeUpdateMany,
    countDocuments: mockNodeCount,
  },
}));
vi.mock('@/models/AgentUpdateJob', () => ({
  default: { updateMany: mockAgentUpdateMany },
}));
vi.mock('@/models/FrpServerState', () => ({
  default: { updateOne: mockFrpUpdateOne },
}));
vi.mock('@/models/FleetLogEvent', () => ({
  default: { create: mockFleetLogCreate },
}));

import { POST } from './route';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/fleet/emergency', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/fleet/emergency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
    mockFleetLogCreate.mockResolvedValue({});
    mockGeneratePairingToken.mockReturnValue('new-token-abcd1234xxxx');
    mockHashPairingToken.mockResolvedValue('hashed');
  });

  it('401 without session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(
      makeReq({
        action: 'disable_all_routes',
        confirm: true,
        reason: 'Prod incident under investigation',
      })
    );
    expect(res.status).toBe(401);
  });

  it('403 when role lacks can_emergency (viewer)', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'viewer', role: 'user' } });
    const res = await POST(
      makeReq({
        action: 'disable_all_routes',
        confirm: true,
        reason: 'Prod incident under investigation',
      })
    );
    expect(res.status).toBe(403);
  });

  it('403 when role is operator (no emergency capability)', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'op', role: 'operator' } });
    const res = await POST(
      makeReq({
        action: 'disable_all_routes',
        confirm: true,
        reason: 'Prod incident under investigation',
      })
    );
    expect(res.status).toBe(403);
  });

  it('rejects missing confirm', async () => {
    const res = await POST(
      makeReq({
        action: 'disable_all_routes',
        reason: 'Short reason here',
      })
    );
    expect(res.status).toBe(400);
  });

  it('rejects short reason', async () => {
    const res = await POST(
      makeReq({
        action: 'disable_all_routes',
        confirm: true,
        reason: 'too',
      })
    );
    expect(res.status).toBe(400);
  });

  it('disables all routes and reports blast radius', async () => {
    mockRouteUpdateMany.mockResolvedValue({ modifiedCount: 7 });
    const res = await POST(
      makeReq({
        action: 'disable_all_routes',
        confirm: true,
        reason: 'Prod incident under investigation',
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.completed).toBe(true);
    expect(json.blastRadius.affectedRoutes).toBe(7);
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'emergency.disable_all_routes',
        audit: true,
      })
    );
  });

  it('rotates token for single node with targetId', async () => {
    const saveFn = vi.fn();
    mockNodeFindById.mockResolvedValue({
      _id: 'n1',
      save: saveFn,
    });
    const res = await POST(
      makeReq({
        action: 'rotate_token',
        confirm: true,
        reason: 'Token compromised, rotate now',
        targetId: 'n1',
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.pairingToken).toBe('new-token-abcd1234xxxx');
    expect(saveFn).toHaveBeenCalled();
  });

  it('requires targetId for rotate_token', async () => {
    const res = await POST(
      makeReq({
        action: 'rotate_token',
        confirm: true,
        reason: 'Token compromised, rotate now',
      })
    );
    expect(res.status).toBe(400);
  });

  it('rotate_all_tokens returns tokens list', async () => {
    mockNodeFind.mockResolvedValue([
      { _id: 'n1', save: vi.fn() },
      { _id: 'n2', save: vi.fn() },
    ]);
    const res = await POST(
      makeReq({
        action: 'rotate_all_tokens',
        confirm: true,
        reason: 'Emergency fleet-wide rotate',
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tokens).toHaveLength(2);
  });

  it('pauses running update jobs', async () => {
    mockAgentUpdateMany.mockResolvedValue({ modifiedCount: 3 });
    const res = await POST(
      makeReq({
        action: 'pause_updates',
        confirm: true,
        reason: 'Pause rollout until investigation',
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.blastRadius.affectedJobs).toBe(3);
  });

  it('stops FRP server', async () => {
    mockFrpUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    const res = await POST(
      makeReq({
        action: 'stop_frps',
        confirm: true,
        reason: 'Hub maintenance window',
      })
    );
    expect(res.status).toBe(200);
    expect(mockFrpUpdateOne).toHaveBeenCalledWith(
      { key: 'global' },
      expect.objectContaining({ enabled: false, runtimeState: 'stopping' })
    );
  });

  it('sets maintenance on all nodes', async () => {
    mockNodeUpdateMany.mockResolvedValue({ modifiedCount: 5 });
    const res = await POST(
      makeReq({
        action: 'fleet_maintenance',
        confirm: true,
        reason: 'Scheduled maintenance window',
      })
    );
    expect(res.status).toBe(200);
    expect(mockNodeUpdateMany).toHaveBeenCalledWith({}, { 'maintenance.enabled': true });
  });
});
