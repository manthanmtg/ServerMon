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

vi.mock('@/models/AlertSubscription', async () => {
  const { AlertSubscriptionZodSchema } = await vi.importActual<
    typeof import('@/models/AlertSubscription')
  >('@/models/AlertSubscription');
  return {
    default: {
      findById: mockFindById,
      findByIdAndUpdate: mockFindByIdAndUpdate,
      findByIdAndDelete: mockFindByIdAndDelete,
    },
    AlertSubscriptionZodSchema,
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
    return new NextRequest('http://localhost/api/fleet/alerts/subscriptions/s1', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  return new NextRequest('http://localhost/api/fleet/alerts/subscriptions/s1', { method });
}

describe('alerts subscriptions [id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    mockFleetLogCreate.mockResolvedValue({});
  });

  it('GET returns 403 for non-admin', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'op', role: 'operator' } });
    const res = await GET(makeReq('GET'), ctx('s1'));
    expect(res.status).toBe(403);
  });

  it('GET returns 404 when not found', async () => {
    mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await GET(makeReq('GET'), ctx('s1'));
    expect(res.status).toBe(404);
  });

  it('GET returns subscription', async () => {
    mockFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 's1', name: 'Sub', channelId: 'c1' }),
    });
    const res = await GET(makeReq('GET'), ctx('s1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.subscription.name).toBe('Sub');
  });

  it('PATCH returns 404 when missing', async () => {
    mockFindById.mockResolvedValue(null);
    const res = await PATCH(makeReq('PATCH', { name: 'y' }), ctx('s1'));
    expect(res.status).toBe(404);
  });

  it('PATCH updates and audits', async () => {
    mockFindById.mockResolvedValue({ _id: 's1' });
    mockFindByIdAndUpdate.mockResolvedValue({
      _id: 's1',
      name: 'y',
      toObject: () => ({ _id: 's1', name: 'y' }),
    });
    const res = await PATCH(makeReq('PATCH', { name: 'y' }), ctx('s1'));
    expect(res.status).toBe(200);
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'alert_subscription.update' })
    );
  });

  it('DELETE returns 404 when missing', async () => {
    mockFindById.mockResolvedValue(null);
    const res = await DELETE(makeReq('DELETE'), ctx('s1'));
    expect(res.status).toBe(404);
  });

  it('DELETE removes and audits', async () => {
    mockFindById.mockResolvedValue({ _id: 's1' });
    mockFindByIdAndDelete.mockResolvedValue({ _id: 's1' });
    const res = await DELETE(makeReq('DELETE'), ctx('s1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deleted).toBe(true);
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'alert_subscription.delete' })
    );
  });
});
