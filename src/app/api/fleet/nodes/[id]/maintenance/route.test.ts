/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetSession, mockFindById, mockFleetLogCreate } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFindById: vi.fn(),
  mockFleetLogCreate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/models/Node', () => ({
  default: { findById: mockFindById },
}));
vi.mock('@/models/FleetLogEvent', () => ({
  default: { create: mockFleetLogCreate },
}));

import { POST } from './route';

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/fleet/nodes/node-1/maintenance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/fleet/nodes/[id]/maintenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFleetLogCreate.mockResolvedValue({});
  });

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeReq({ enabled: true }), makeContext('node-1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for viewer role', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'v', role: 'user' } });
    const res = await POST(makeReq({ enabled: true }), makeContext('node-1'));
    expect(res.status).toBe(403);
  });

  it('returns 400 on invalid body', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    const res = await POST(makeReq({ foo: 'bar' }), makeContext('node-1'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when node not found', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    mockFindById.mockResolvedValue(null);
    const res = await POST(makeReq({ enabled: true }), makeContext('node-1'));
    expect(res.status).toBe(404);
  });

  it('updates maintenance and emits audit', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const nodeDoc = {
      maintenance: { enabled: false },
      save: saveFn,
      toObject: () => ({ maintenance: { enabled: true, reason: 'patching' } }),
    };
    mockFindById.mockResolvedValue(nodeDoc);

    const res = await POST(makeReq({ enabled: true, reason: 'patching' }), makeContext('node-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.node.maintenance.enabled).toBe(true);
    expect(nodeDoc.maintenance).toEqual({
      enabled: true,
      reason: 'patching',
      until: undefined,
    });
    expect(saveFn).toHaveBeenCalled();
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'node.maintenance_toggle', audit: true })
    );
  });
});
