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

vi.mock('@/models/AgentUpdateJob', async () => {
  const { AgentUpdateJobZodSchema } =
    await vi.importActual<typeof import('@/models/AgentUpdateJob')>('@/models/AgentUpdateJob');
  return {
    default: { find: mockFind, create: mockCreate },
    AgentUpdateJobZodSchema,
  };
});

vi.mock('@/models/FleetLogEvent', () => ({
  default: { create: mockFleetLogCreate },
}));

import { GET, POST } from './route';

function makeReq(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/fleet/updates');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/fleet/updates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/fleet/updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
  });

  it('returns 401 without session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('applies status filter', async () => {
    mockFind.mockReturnValue({
      sort: () => ({ lean: vi.fn().mockResolvedValue([]) }),
    });
    await GET(makeReq({ status: 'running' }));
    expect(mockFind).toHaveBeenCalledWith({ status: 'running' });
  });
});

describe('POST /api/fleet/updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
    mockFleetLogCreate.mockResolvedValue({});
    mockCreate.mockImplementation(async (doc: Record<string, unknown>) => ({
      ...doc,
      _id: 'j1',
      toObject() {
        return { ...doc, _id: 'j1' };
      },
    }));
  });

  it('rejects invalid body', async () => {
    const res = await POST(makePost({}));
    expect(res.status).toBe(400);
  });

  it('creates job with status=pending', async () => {
    const body = {
      targets: { mode: 'fleet' as const },
      versionTarget: 'v1.2.3',
    };
    const res = await POST(makePost(body));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.job.status).toBe('pending');
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'update_job.create' })
    );
  });
});
