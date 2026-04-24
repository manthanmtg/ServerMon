/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetSession,
  mockApplyRevision,
  mockFleetLogCreate,
  mockGetFrp,
  mockGetNginx,
  mockEmit,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockApplyRevision: vi.fn(),
  mockFleetLogCreate: vi.fn(),
  mockGetFrp: vi.fn(),
  mockGetNginx: vi.fn(),
  mockEmit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/models/ConfigRevision', () => ({ default: {} }));
vi.mock('@/models/FrpServerState', () => ({ default: {} }));
vi.mock('@/models/PublicRoute', () => ({ default: {} }));
vi.mock('@/models/Node', () => ({ default: {} }));
vi.mock('@/models/FleetLogEvent', () => ({ default: { create: mockFleetLogCreate } }));
vi.mock('@/lib/fleet/applyEngine', () => ({ applyRevision: mockApplyRevision }));
vi.mock('@/lib/fleet/orchestrators', () => ({
  getFrpOrchestrator: mockGetFrp,
  getNginxOrchestrator: mockGetNginx,
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
  return new NextRequest('http://localhost/api/fleet/revisions/rev1/apply', {
    method: 'POST',
  });
}

describe('POST /api/fleet/revisions/[id]/apply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
    mockFleetLogCreate.mockResolvedValue({});
    mockGetFrp.mockReturnValue({
      applyRevision: vi.fn().mockResolvedValue(undefined),
      reconcileOnce: vi.fn().mockResolvedValue({ action: 'none' }),
    });
    mockGetNginx.mockReturnValue({
      writeSnippet: vi.fn().mockResolvedValue(''),
      removeSnippet: vi.fn().mockResolvedValue(undefined),
      applyAndReload: vi.fn().mockResolvedValue({ ok: true, stderr: '' }),
    });
  });

  it('returns 401 without session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeReq(), ctx('rev1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for viewer role', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'v', role: 'user' } });
    const res = await POST(makeReq(), ctx('rev1'));
    expect(res.status).toBe(403);
  });

  it('applies revision and returns result', async () => {
    mockApplyRevision.mockResolvedValue({ kind: 'frps', reloaded: false });
    const res = await POST(makeReq(), ctx('rev1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toEqual({ kind: 'frps', reloaded: false });
    expect(mockApplyRevision).toHaveBeenCalledWith(
      'rev1',
      expect.objectContaining({
        frp: expect.anything(),
        nginx: expect.anything(),
        ConfigRevision: expect.anything(),
        FrpServerState: expect.anything(),
        PublicRoute: expect.anything(),
        Node: expect.anything(),
      })
    );
  });

  it('records audit event with revision.apply eventType', async () => {
    mockApplyRevision.mockResolvedValue({ kind: 'nginx', reloaded: true });
    await POST(makeReq(), ctx('rev1'));
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'revision.apply',
        actorUserId: 'admin',
        metadata: expect.objectContaining({
          revisionId: 'rev1',
          kind: 'nginx',
          reloaded: true,
        }),
      })
    );
  });

  it('returns 404 when revision not found', async () => {
    mockApplyRevision.mockRejectedValue(new Error('revision not found'));
    const res = await POST(makeReq(), ctx('rev1'));
    expect(res.status).toBe(404);
  });

  it('returns 500 on other errors from applyRevision', async () => {
    mockApplyRevision.mockRejectedValue(new Error('db down'));
    const res = await POST(makeReq(), ctx('rev1'));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain('db down');
  });

  it('emits revision.applied event bus event on success', async () => {
    mockApplyRevision.mockResolvedValue({ kind: 'frps', reloaded: true });
    const res = await POST(makeReq(), ctx('rev1'));
    expect(res.status).toBe(200);
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'revision.applied',
        at: expect.any(String),
        data: expect.objectContaining({
          revisionId: 'rev1',
          kind: 'frps',
          reloaded: true,
        }),
      })
    );
  });

  it('does not emit revision.applied event bus event on failure', async () => {
    mockApplyRevision.mockRejectedValue(new Error('db down'));
    await POST(makeReq(), ctx('rev1'));
    expect(mockEmit).not.toHaveBeenCalled();
  });
});
