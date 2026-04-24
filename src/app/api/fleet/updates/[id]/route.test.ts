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
vi.mock('@/lib/fleet/audit', () => ({
  recordAudit: (_m: unknown, input: Record<string, unknown>) =>
    mockFleetLogCreate({ ...input, audit: true, eventType: input.action }),
}));

vi.mock('@/models/AgentUpdateJob', () => ({
  default: { findById: mockFindById },
}));
vi.mock('@/models/FleetLogEvent', () => ({
  default: { create: mockFleetLogCreate },
}));

import { GET, PATCH } from './route';

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeReq(method: string, body?: unknown): NextRequest {
  if (body !== undefined) {
    return new NextRequest('http://localhost/api/fleet/updates/j1', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  return new NextRequest('http://localhost/api/fleet/updates/j1', { method });
}

describe('updates [id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
    mockFleetLogCreate.mockResolvedValue({});
  });

  it('GET returns 404 when missing', async () => {
    mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await GET(makeReq('GET'), ctx('j1'));
    expect(res.status).toBe(404);
  });

  it('GET returns job', async () => {
    mockFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'j1', status: 'running' }),
    });
    const res = await GET(makeReq('GET'), ctx('j1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.job.status).toBe('running');
  });

  it('PATCH cancel sets status=cancelled', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const jobDoc = {
      _id: 'j1',
      status: 'running',
      save: saveFn,
      toObject: () => ({ _id: 'j1', status: 'cancelled' }),
    };
    mockFindById.mockResolvedValue(jobDoc);
    const res = await PATCH(makeReq('PATCH', { action: 'cancel' }), ctx('j1'));
    expect(res.status).toBe(200);
    expect(jobDoc.status).toBe('cancelled');
    expect(saveFn).toHaveBeenCalled();
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'update_job.cancel' })
    );
  });

  it('PATCH pause sets status=paused', async () => {
    const jobDoc = {
      status: 'running',
      save: vi.fn(),
      toObject: () => ({ status: 'paused' }),
    };
    mockFindById.mockResolvedValue(jobDoc);
    const res = await PATCH(makeReq('PATCH', { action: 'pause' }), ctx('j1'));
    expect(res.status).toBe(200);
    expect(jobDoc.status).toBe('paused');
  });

  it('PATCH resume sets status=running', async () => {
    const jobDoc = {
      status: 'paused',
      save: vi.fn(),
      toObject: () => ({ status: 'running' }),
    };
    mockFindById.mockResolvedValue(jobDoc);
    const res = await PATCH(makeReq('PATCH', { action: 'resume' }), ctx('j1'));
    expect(res.status).toBe(200);
    expect(jobDoc.status).toBe('running');
  });

  it('PATCH rejects unknown action', async () => {
    mockFindById.mockResolvedValue({
      status: 'running',
      save: vi.fn(),
      toObject: () => ({}),
    });
    const res = await PATCH(makeReq('PATCH', { action: 'teleport' }), ctx('j1'));
    expect(res.status).toBe(400);
  });
});
