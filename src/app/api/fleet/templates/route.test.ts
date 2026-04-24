/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetSession,
  mockFind,
  mockFindOne,
  mockCountDocuments,
  mockCreate,
  mockFleetLogCreate,
  mockSeedBuiltinTemplates,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFind: vi.fn(),
  mockFindOne: vi.fn(),
  mockCountDocuments: vi.fn(),
  mockCreate: vi.fn(),
  mockFleetLogCreate: vi.fn(),
  mockSeedBuiltinTemplates: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/fleet/templates', () => ({
  seedBuiltinTemplates: mockSeedBuiltinTemplates,
}));
vi.mock('@/lib/fleet/audit', () => ({
  recordAudit: (_m: unknown, input: Record<string, unknown>) =>
    mockFleetLogCreate({ ...input, audit: true, eventType: input.action }),
}));

vi.mock('@/models/RouteTemplate', async () => {
  const { RouteTemplateZodSchema } =
    await vi.importActual<typeof import('@/models/RouteTemplate')>('@/models/RouteTemplate');
  return {
    default: {
      find: mockFind,
      findOne: mockFindOne,
      countDocuments: mockCountDocuments,
      create: mockCreate,
    },
    RouteTemplateZodSchema,
  };
});

vi.mock('@/models/FleetLogEvent', () => ({
  default: { create: mockFleetLogCreate },
}));

import { GET, POST } from './route';

function makeGet(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/fleet/templates');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/fleet/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/fleet/templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
    mockFind.mockReturnValue({
      sort: () => ({ lean: vi.fn().mockResolvedValue([]) }),
    });
    mockCountDocuments.mockResolvedValue(10);
    mockSeedBuiltinTemplates.mockResolvedValue(10);
  });

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it('seeds builtins when count is zero', async () => {
    mockCountDocuments.mockResolvedValue(0);
    await GET(makeGet());
    expect(mockSeedBuiltinTemplates).toHaveBeenCalled();
  });

  it('does not seed when templates already exist', async () => {
    mockCountDocuments.mockResolvedValue(10);
    await GET(makeGet());
    expect(mockSeedBuiltinTemplates).not.toHaveBeenCalled();
  });

  it('filters by kind query param', async () => {
    await GET(makeGet({ kind: 'builtin' }));
    expect(mockFind).toHaveBeenCalledWith({ kind: 'builtin' });
  });

  it('returns 500 on error', async () => {
    mockCountDocuments.mockRejectedValue(new Error('db'));
    const res = await GET(makeGet());
    expect(res.status).toBe(500);
  });
});

describe('POST /api/fleet/templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
    mockFindOne.mockResolvedValue(null);
    mockFleetLogCreate.mockResolvedValue({});
    mockCreate.mockImplementation(async (doc: Record<string, unknown>) => ({
      ...doc,
      _id: 'tmpl-1',
      toObject() {
        return { ...doc, _id: 'tmpl-1' };
      },
    }));
  });

  const validBody = {
    name: 'My HTTP',
    slug: 'my-http',
    kind: 'custom' as const,
    defaults: {
      protocol: 'http' as const,
      websocket: false,
      timeoutSec: 60,
      uploadBodyMb: 32,
      headers: {},
      accessMode: 'servermon_auth' as const,
      logLevel: 'info' as const,
    },
  };

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makePost(validBody));
    expect(res.status).toBe(401);
  });

  it('rejects invalid body with 400', async () => {
    const res = await POST(makePost({ slug: 'x' }));
    expect(res.status).toBe(400);
  });

  it('rejects duplicate slug with 409', async () => {
    mockFindOne.mockResolvedValue({ _id: 'x', slug: 'my-http' });
    const res = await POST(makePost(validBody));
    expect(res.status).toBe(409);
  });

  it('creates template, records audit', async () => {
    const res = await POST(makePost(validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.template.slug).toBe('my-http');
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'template.create' })
    );
  });

  it('returns 500 on error', async () => {
    mockCreate.mockRejectedValue(new Error('db'));
    const res = await POST(makePost(validBody));
    expect(res.status).toBe(500);
  });
});
