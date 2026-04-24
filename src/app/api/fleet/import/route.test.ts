/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetSession, mockImportedCreate, mockNodeFind, mockRouteFind, mockFleetLogCreate } =
  vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockImportedCreate: vi.fn(),
    mockNodeFind: vi.fn(),
    mockRouteFind: vi.fn(),
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

vi.mock('@/models/ImportedConfig', () => ({
  default: { create: mockImportedCreate },
}));
vi.mock('@/models/Node', () => ({ default: { find: mockNodeFind } }));
vi.mock('@/models/PublicRoute', () => ({ default: { find: mockRouteFind } }));
vi.mock('@/models/FleetLogEvent', () => ({
  default: { create: mockFleetLogCreate },
}));

import { POST } from './route';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/fleet/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/fleet/import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
    mockNodeFind.mockReturnValue({
      select: () => ({ lean: vi.fn().mockResolvedValue([]) }),
    });
    mockRouteFind.mockReturnValue({
      select: () => ({ lean: vi.fn().mockResolvedValue([]) }),
    });
    mockFleetLogCreate.mockResolvedValue({});
    mockImportedCreate.mockImplementation(async (doc: Record<string, unknown>) => ({
      ...doc,
      _id: 'imp-1',
      toObject() {
        return { ...doc, _id: 'imp-1' };
      },
    }));
  });

  it('returns 401 without session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeReq({ kind: 'nginx', raw: 'server { server_name a.example; }' }));
    expect(res.status).toBe(401);
  });

  it('rejects invalid kind with 400', async () => {
    const res = await POST(makeReq({ kind: 'apache', raw: 'x' }));
    expect(res.status).toBe(400);
  });

  it('rejects empty raw with 400', async () => {
    const res = await POST(makeReq({ kind: 'frp', raw: '' }));
    expect(res.status).toBe(400);
  });

  it('imports frp config and records audit', async () => {
    const raw = 'serverAddr = "hub.example"\n[[proxies]]\nname = "web"\n';
    const res = await POST(makeReq({ kind: 'frp', raw }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.imported.kind).toBe('frp');
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'import.create' })
    );
  });

  it('imports nginx and detects domain conflict', async () => {
    mockRouteFind.mockReturnValue({
      select: () => ({
        lean: vi.fn().mockResolvedValue([{ domain: 'taken.example.com' }]),
      }),
    });
    const raw =
      'server {\n  server_name taken.example.com;\n  location / { proxy_pass http://127.0.0.1:3000; }\n}';
    const res = await POST(makeReq({ kind: 'nginx', raw }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.conflicts.some((c: string) => c.includes('taken.example.com'))).toBe(true);
  });

  it('returns 500 on unexpected error', async () => {
    mockImportedCreate.mockRejectedValue(new Error('db'));
    const res = await POST(makeReq({ kind: 'nginx', raw: 'server { server_name a.example; }' }));
    expect(res.status).toBe(500);
  });
});
