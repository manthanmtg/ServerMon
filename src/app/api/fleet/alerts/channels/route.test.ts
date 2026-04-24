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

vi.mock('@/models/AlertChannel', async () => {
  const { AlertChannelZodSchema } =
    await vi.importActual<typeof import('@/models/AlertChannel')>('@/models/AlertChannel');
  return {
    default: { find: mockFind, create: mockCreate },
    AlertChannelZodSchema,
  };
});

vi.mock('@/models/FleetLogEvent', () => ({
  default: { create: mockFleetLogCreate },
}));

import { GET, POST } from './route';

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/fleet/alerts/channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/fleet/alerts/channels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
  });

  it('returns 401 without session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when role lacks can_manage_alerts', async () => {
    mockGetSession.mockResolvedValue({
      user: { username: 'viewer', role: 'viewer' },
    });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns list of channels for admin', async () => {
    mockFind.mockReturnValue({
      sort: () => ({
        lean: vi.fn().mockResolvedValue([{ _id: 'c1', name: 'Webhook', kind: 'webhook' }]),
      }),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.channels).toHaveLength(1);
  });
});

describe('POST /api/fleet/alerts/channels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
    mockFleetLogCreate.mockResolvedValue({});
    mockCreate.mockImplementation(async (doc: Record<string, unknown>) => ({
      ...doc,
      _id: 'c1',
      toObject() {
        return { ...doc, _id: 'c1' };
      },
    }));
  });

  it('returns 403 for non-admin', async () => {
    mockGetSession.mockResolvedValue({
      user: { username: 'op', role: 'operator' },
    });
    const res = await POST(
      makePost({ name: 'X', slug: 'x', kind: 'webhook', config: { url: 'https://x' } })
    );
    expect(res.status).toBe(403);
  });

  it('rejects invalid body with 400', async () => {
    const res = await POST(makePost({ name: '', slug: 'x', kind: 'webhook' }));
    expect(res.status).toBe(400);
  });

  it('creates channel and records audit', async () => {
    const body = {
      name: 'Webhook',
      slug: 'webhook-ops',
      kind: 'webhook' as const,
      config: { url: 'https://example.com/hook' },
    };
    const res = await POST(makePost(body));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.channel.slug).toBe('webhook-ops');
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'alert_channel.create' })
    );
  });
});
