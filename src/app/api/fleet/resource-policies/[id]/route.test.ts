/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetSession,
  mockFindById,
  mockFindByIdAndUpdate,
  mockFindByIdAndDelete,
  mockFleetLogCreate,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFindById: vi.fn(),
  mockFindByIdAndUpdate: vi.fn(),
  mockFindByIdAndDelete: vi.fn(),
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

vi.mock('@/models/ResourcePolicy', async () => {
  const { ResourcePolicyZodSchema } =
    await vi.importActual<typeof import('@/models/ResourcePolicy')>('@/models/ResourcePolicy');
  return {
    default: {
      findById: mockFindById,
      findByIdAndUpdate: mockFindByIdAndUpdate,
      findByIdAndDelete: mockFindByIdAndDelete,
    },
    ResourcePolicyZodSchema,
  };
});

vi.mock('@/models/FleetLogEvent', () => ({
  default: { create: mockFleetLogCreate },
}));

import { GET, PATCH, DELETE } from './route';

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeReq(method: string, body?: unknown): NextRequest {
  if (body !== undefined) {
    return new NextRequest('http://localhost/api/fleet/resource-policies/rp1', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  return new NextRequest('http://localhost/api/fleet/resource-policies/rp1', { method });
}

describe('resource-policies [id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
    mockFleetLogCreate.mockResolvedValue({});
  });

  it('GET returns 404 when not found', async () => {
    mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await GET(makeReq('GET'), ctx('rp1'));
    expect(res.status).toBe(404);
  });

  it('GET returns policy', async () => {
    mockFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'rp1', scope: 'global' }),
    });
    const res = await GET(makeReq('GET'), ctx('rp1'));
    expect(res.status).toBe(200);
  });

  it('PATCH updates', async () => {
    mockFindById.mockResolvedValue({ _id: 'rp1' });
    mockFindByIdAndUpdate.mockResolvedValue({
      _id: 'rp1',
      scope: 'global',
      toObject: () => ({ _id: 'rp1', scope: 'global' }),
    });
    const res = await PATCH(makeReq('PATCH', { limits: { maxAgents: 5 } }), ctx('rp1'));
    expect(res.status).toBe(200);
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'resource_policy.update' })
    );
  });

  it('DELETE removes', async () => {
    mockFindById.mockResolvedValue({ _id: 'rp1' });
    mockFindByIdAndDelete.mockResolvedValue({ _id: 'rp1' });
    const res = await DELETE(makeReq('DELETE'), ctx('rp1'));
    expect(res.status).toBe(200);
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'resource_policy.delete' })
    );
  });
});
