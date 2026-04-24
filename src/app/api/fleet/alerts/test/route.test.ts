/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetSession,
  mockFindById,
  mockFindByIdAndUpdate,
  mockFleetLogCreate,
  mockDispatchAlert,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFindById: vi.fn(),
  mockFindByIdAndUpdate: vi.fn(),
  mockFleetLogCreate: vi.fn(),
  mockDispatchAlert: vi.fn(),
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

vi.mock('@/models/AlertChannel', () => ({
  default: {
    findById: mockFindById,
    find: vi.fn(),
    findByIdAndUpdate: mockFindByIdAndUpdate,
  },
}));

vi.mock('@/models/FleetLogEvent', () => ({
  default: { create: mockFleetLogCreate },
}));

vi.mock('@/lib/fleet/alerts', async () => {
  const actual = await vi.importActual<typeof import('@/lib/fleet/alerts')>('@/lib/fleet/alerts');
  return {
    ...actual,
    dispatchAlert: mockDispatchAlert,
  };
});

import { POST } from './route';

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/fleet/alerts/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/fleet/alerts/test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    mockFleetLogCreate.mockResolvedValue({});
  });

  it('returns 401 without session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makePost({ channelId: 'c1' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'op', role: 'operator' } });
    const res = await POST(makePost({ channelId: 'c1' }));
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid body', async () => {
    const res = await POST(makePost({ channelId: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when channel missing', async () => {
    mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await POST(makePost({ channelId: 'c1' }));
    expect(res.status).toBe(404);
  });

  it('dispatches test alert and records audit', async () => {
    mockFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'c1', kind: 'webhook' }),
    });
    mockDispatchAlert.mockResolvedValue({ dispatched: 1, failures: [] });

    const res = await POST(makePost({ channelId: 'c1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.dispatched).toBe(1);
    expect(mockDispatchAlert).toHaveBeenCalledWith(
      expect.objectContaining({ eventKind: 'alert.test' }),
      expect.any(Object)
    );
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'alert_channel.test' })
    );
  });

  it('returns 502 when dispatch fails', async () => {
    mockFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'c1', kind: 'webhook' }),
    });
    mockDispatchAlert.mockResolvedValue({
      dispatched: 0,
      failures: [{ channelId: 'c1', error: 'network error' }],
    });

    const res = await POST(makePost({ channelId: 'c1' }));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.failures[0].error).toBe('network error');
  });

  it('applies custom payload fields', async () => {
    mockFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'c1', kind: 'webhook' }),
    });
    mockDispatchAlert.mockResolvedValue({ dispatched: 1, failures: [] });

    await POST(
      makePost({
        channelId: 'c1',
        payload: {
          title: 'Hello',
          message: 'Custom',
          severity: 'error',
          eventKind: 'custom.event',
        },
      })
    );

    const [payloadArg] = mockDispatchAlert.mock.calls[0];
    expect(payloadArg).toMatchObject({
      title: 'Hello',
      message: 'Custom',
      severity: 'error',
      eventKind: 'custom.event',
    });
  });
});
