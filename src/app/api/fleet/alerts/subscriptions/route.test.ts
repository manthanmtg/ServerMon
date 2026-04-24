/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetSession, mockFind, mockCreate, mockFleetLogCreate } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFind: vi.fn(),
  mockCreate: vi.fn(),
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
    default: { find: mockFind, create: mockCreate },
    AlertSubscriptionZodSchema,
  };
});

vi.mock('@/models/FleetLogEvent', () => ({
  default: { create: mockFleetLogCreate },
}));

import { GET, POST } from './route';

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/fleet/alerts/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/fleet/alerts/subscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
  });

  it('returns 401 without session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'op', role: 'operator' } });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns subscriptions for admin', async () => {
    mockFind.mockReturnValue({
      sort: () => ({
        lean: vi.fn().mockResolvedValue([{ _id: 's1', name: 'All', channelId: 'c1' }]),
      }),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.subscriptions).toHaveLength(1);
  });
});

describe('POST /api/fleet/alerts/subscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    mockFleetLogCreate.mockResolvedValue({});
    mockCreate.mockImplementation(async (doc: Record<string, unknown>) => ({
      ...doc,
      _id: 's1',
      toObject() {
        return { ...doc, _id: 's1' };
      },
    }));
  });

  it('rejects invalid body with 400', async () => {
    const res = await POST(makePost({ name: '', channelId: '', eventKinds: [] }));
    expect(res.status).toBe(400);
  });

  it('creates subscription and records audit', async () => {
    const body = {
      name: 'All reboots',
      channelId: 'c1',
      eventKinds: ['node.reboot'],
    };
    const res = await POST(makePost(body));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.subscription.name).toBe('All reboots');
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'alert_subscription.create' })
    );
  });
});
