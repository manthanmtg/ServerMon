/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetSession, mockCheckNginxDns } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockCheckNginxDns: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSession: mockGetSession,
}));

vi.mock('@/lib/nginx/dns', () => ({
  checkNginxDns: mockCheckNginxDns,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/modules/nginx/dns/check', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/modules/nginx/dns/check', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    mockCheckNginxDns.mockResolvedValue({
      domainPattern: '*.apps.example.com',
      lookupName: 'test.apps.example.com',
      recordName: '*.apps',
      records: [],
      warnings: [],
      resolved: { a: ['203.0.113.10'], aaaa: [], cname: [] },
      matchesServerIp: true,
    });
  });

  it('requires authentication', async () => {
    mockGetSession.mockResolvedValue(null);
    const { POST } = await import('./route');

    const res = await POST(request({ domainPattern: 'app.example.com' }));

    expect(res.status).toBe(401);
  });

  it('returns DNS guidance and resolution result', async () => {
    const { POST } = await import('./route');

    const res = await POST(
      request({ domainPattern: '*.apps.example.com', serverIp: '203.0.113.10' })
    );

    expect(res.status).toBe(200);
    expect(mockCheckNginxDns).toHaveBeenCalledWith('*.apps.example.com', {
      serverIp: '203.0.113.10',
    });
    expect(await res.json()).toEqual({
      result: expect.objectContaining({ matchesServerIp: true }),
    });
  });
});
