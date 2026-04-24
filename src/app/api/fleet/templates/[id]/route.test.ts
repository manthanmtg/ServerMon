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

vi.mock('@/models/RouteTemplate', async () => {
  const { RouteTemplateZodSchema } =
    await vi.importActual<typeof import('@/models/RouteTemplate')>('@/models/RouteTemplate');
  return {
    default: {
      findById: mockFindById,
      findByIdAndUpdate: mockFindByIdAndUpdate,
      findByIdAndDelete: mockFindByIdAndDelete,
    },
    RouteTemplateZodSchema,
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
    return new NextRequest('http://localhost/api/fleet/templates/t1', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  return new NextRequest('http://localhost/api/fleet/templates/t1', {
    method,
  });
}

describe('GET /api/fleet/templates/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
  });

  it('returns 401 without session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET(makeReq('GET'), ctx('t1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when not found', async () => {
    mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await GET(makeReq('GET'), ctx('t1'));
    expect(res.status).toBe(404);
  });

  it('returns template', async () => {
    mockFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 't1', slug: 'x' }),
    });
    const res = await GET(makeReq('GET'), ctx('t1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.template.slug).toBe('x');
  });
});

describe('PATCH /api/fleet/templates/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
    mockFleetLogCreate.mockResolvedValue({});
  });

  it('returns 404 when missing', async () => {
    mockFindById.mockResolvedValue(null);
    const res = await PATCH(makeReq('PATCH', { name: 'X' }), ctx('t1'));
    expect(res.status).toBe(404);
  });

  it('returns 409 when kind=builtin', async () => {
    mockFindById.mockResolvedValue({ _id: 't1', kind: 'builtin' });
    const res = await PATCH(makeReq('PATCH', { name: 'X' }), ctx('t1'));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('Cannot modify builtin templates');
  });

  it('updates custom template', async () => {
    mockFindById.mockResolvedValue({ _id: 't1', kind: 'custom' });
    mockFindByIdAndUpdate.mockResolvedValue({
      _id: 't1',
      name: 'Renamed',
      toObject: () => ({ _id: 't1', name: 'Renamed' }),
    });
    const res = await PATCH(makeReq('PATCH', { name: 'Renamed' }), ctx('t1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.template.name).toBe('Renamed');
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'template.update' })
    );
  });

  it('rejects invalid body with 400', async () => {
    mockFindById.mockResolvedValue({ _id: 't1', kind: 'custom' });
    const res = await PATCH(makeReq('PATCH', { defaults: { protocol: 'bad' } }), ctx('t1'));
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/fleet/templates/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
    mockFleetLogCreate.mockResolvedValue({});
  });

  it('returns 404 when missing', async () => {
    mockFindById.mockResolvedValue(null);
    const res = await DELETE(makeReq('DELETE'), ctx('t1'));
    expect(res.status).toBe(404);
  });

  it('returns 409 for builtin', async () => {
    mockFindById.mockResolvedValue({ _id: 't1', kind: 'builtin' });
    const res = await DELETE(makeReq('DELETE'), ctx('t1'));
    expect(res.status).toBe(409);
  });

  it('deletes custom template and records audit', async () => {
    mockFindById.mockResolvedValue({ _id: 't1', kind: 'custom' });
    mockFindByIdAndDelete.mockResolvedValue({ _id: 't1' });
    const res = await DELETE(makeReq('DELETE'), ctx('t1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deleted).toBe(true);
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'template.delete' })
    );
  });
});
