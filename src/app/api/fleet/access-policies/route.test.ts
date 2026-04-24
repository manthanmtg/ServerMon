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

vi.mock('@/models/AccessPolicy', async () => {
  const { AccessPolicyZodSchema } =
    await vi.importActual<typeof import('@/models/AccessPolicy')>('@/models/AccessPolicy');
  return {
    default: { find: mockFind, create: mockCreate },
    AccessPolicyZodSchema,
  };
});

vi.mock('@/models/FleetLogEvent', () => ({
  default: { create: mockFleetLogCreate },
}));

import { GET, POST } from './route';

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/fleet/access-policies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/fleet/access-policies', () => {
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

  it('returns list of policies', async () => {
    mockFind.mockReturnValue({
      sort: () => ({
        lean: vi.fn().mockResolvedValue([{ _id: 'p1', name: 'x' }]),
      }),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.policies).toHaveLength(1);
  });
});

describe('POST /api/fleet/access-policies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
    mockFleetLogCreate.mockResolvedValue({});
    mockCreate.mockImplementation(async (doc: Record<string, unknown>) => ({
      ...doc,
      _id: 'p1',
      toObject() {
        return { ...doc, _id: 'p1' };
      },
    }));
  });

  it('rejects invalid body with 400', async () => {
    const res = await POST(makePost({ name: '' }));
    expect(res.status).toBe(400);
  });

  it('creates policy and records audit', async () => {
    const body = {
      name: 'prod',
      mode: 'servermon_auth' as const,
    };
    const res = await POST(makePost(body));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.policy.name).toBe('prod');
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'access_policy.create' })
    );
  });
});
