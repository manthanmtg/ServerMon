/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSession, mockFrpFindOne, mockFrpCreate, mockFleetLogCreate } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFrpFindOne: vi.fn(),
  mockFrpCreate: vi.fn(),
  mockFleetLogCreate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));

vi.mock('@/models/FrpServerState', () => ({
  default: { findOne: mockFrpFindOne, create: mockFrpCreate },
}));
vi.mock('@/models/FleetLogEvent', () => ({
  default: { create: mockFleetLogCreate },
}));

import { POST } from './route';

function buildStateDoc(over: Record<string, unknown> = {}) {
  const data = {
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
      return { ...this, save: undefined, toObject: undefined };
    },
  };
  return doc;
}

describe('POST /api/fleet/server/restart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    mockFleetLogCreate.mockResolvedValue({});
  });

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('returns 403 for viewer role', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'v', role: 'user' } });
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it('sets runtimeState to starting, updates lastRestartAt, audits', async () => {
    const doc = buildStateDoc();
    mockFrpFindOne.mockResolvedValue(doc);

    const res = await POST();
    expect(res.status).toBe(200);
    expect(doc.runtimeState).toBe('starting');
    expect(doc.lastRestartAt).toBeInstanceOf(Date);
    expect(doc.save).toHaveBeenCalled();
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'frps.restart', audit: true })
    );
  });

  it('creates singleton when missing', async () => {
    const doc = buildStateDoc();
    mockFrpFindOne.mockResolvedValue(null);
    mockFrpCreate.mockResolvedValue(doc);

    const res = await POST();
    expect(res.status).toBe(200);
    expect(mockFrpCreate).toHaveBeenCalled();
    expect(doc.runtimeState).toBe('starting');
  });

  it('returns 500 on db error', async () => {
    mockFrpFindOne.mockRejectedValue(new Error('db down'));
    const res = await POST();
    expect(res.status).toBe(500);
  });
});
