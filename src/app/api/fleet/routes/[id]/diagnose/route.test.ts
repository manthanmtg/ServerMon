/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetSession, mockRouteFindById, mockDiagnosticRunCreate } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRouteFindById: vi.fn(),
  mockDiagnosticRunCreate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/models/PublicRoute', () => ({
  default: { findById: mockRouteFindById },
}));
vi.mock('@/models/DiagnosticRun', () => ({
  default: { create: mockDiagnosticRunCreate },
}));

import { POST } from './route';

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/fleet/routes/r/diagnose', {
    method: 'POST',
  });
}

describe('POST /api/fleet/routes/[id]/diagnose', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDiagnosticRunCreate.mockImplementation(async (doc: unknown) => ({
      toObject: () => doc,
    }));
  });

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeReq(), makeContext('route-1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when route is missing', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    mockRouteFindById.mockResolvedValue(null);
    const res = await POST(makeReq(), makeContext('route-1'));
    expect(res.status).toBe(404);
  });

  it('runs the route diagnostic chain and persists the run', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    mockRouteFindById.mockResolvedValue({ _id: 'route-1' });

    const res = await POST(makeReq(), makeContext('route-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.kind).toBe('route');
    expect(json.targetId).toBe('route-1');
    expect(Array.isArray(json.steps)).toBe(true);
    expect(json.steps.length).toBeGreaterThan(0);
    expect(json.steps.every((s: { status: string }) => s.status === 'fail')).toBe(true);
    expect(json.summary).toBe('fail');
    expect(mockDiagnosticRunCreate).toHaveBeenCalled();
  });
});
