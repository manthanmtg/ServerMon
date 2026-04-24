/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetSession, mockImportedCreate, mockNodeFind, mockRouteFind } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockImportedCreate: vi.fn(),
  mockNodeFind: vi.fn(),
  mockRouteFind: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/models/ImportedConfig', () => ({
  default: { create: mockImportedCreate },
}));
vi.mock('@/models/Node', () => ({
  default: { find: mockNodeFind },
}));
vi.mock('@/models/PublicRoute', () => ({
  default: { find: mockRouteFind },
}));

import { POST } from './route';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/fleet/nginx/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/fleet/nginx/import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    mockNodeFind.mockReturnValue({
      select: () => ({ lean: vi.fn().mockResolvedValue([]) }),
    });
    mockRouteFind.mockReturnValue({
      select: () => ({ lean: vi.fn().mockResolvedValue([]) }),
    });
    mockImportedCreate.mockImplementation(async (doc: Record<string, unknown>) => ({
      ...doc,
      _id: 'imp-1',
      toObject() {
        return { ...doc, _id: 'imp-1' };
      },
    }));
  });

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeReq({ raw: 'server { server_name a.example; }' }));
    expect(res.status).toBe(401);
  });

  it('rejects empty raw with 400', async () => {
    const res = await POST(makeReq({ raw: '' }));
    expect(res.status).toBe(400);
  });

  it('parses raw nginx config and stores imported doc', async () => {
    const raw =
      'server {\n  listen 80;\n  server_name a.example.com;\n  location / { proxy_pass http://127.0.0.1:3000; }\n}';
    const res = await POST(makeReq({ raw, sourcePath: '/etc/nginx/a.conf' }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.imported.kind).toBe('nginx');
    expect(json.imported.status).toBe('unmanaged');
    expect(Array.isArray(json.conflicts)).toBe(true);
    expect(mockImportedCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'nginx',
        sourcePath: '/etc/nginx/a.conf',
        status: 'unmanaged',
      })
    );
  });

  it('detects domain conflict with existing public route', async () => {
    mockRouteFind.mockReturnValue({
      select: () => ({
        lean: vi.fn().mockResolvedValue([{ domain: 'taken.example.com' }]),
      }),
    });
    const raw =
      'server {\n  server_name taken.example.com;\n  location / { proxy_pass http://127.0.0.1:3000; }\n}';
    const res = await POST(makeReq({ raw }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.conflicts.length).toBeGreaterThan(0);
    expect(json.conflicts.some((c: string) => c.includes('taken.example.com'))).toBe(true);
  });

  it('returns 500 on unexpected error', async () => {
    mockImportedCreate.mockRejectedValue(new Error('db'));
    const res = await POST(makeReq({ raw: 'server { server_name a.example; }' }));
    expect(res.status).toBe(500);
  });
});
