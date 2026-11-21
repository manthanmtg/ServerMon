/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetSession, mockWriteManagedConfig } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockWriteManagedConfig: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSession: mockGetSession,
}));

vi.mock('@/lib/nginx/managed-config', () => ({
  writeManagedConfig: mockWriteManagedConfig,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/modules/nginx/vhosts', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/modules/nginx/vhosts', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    mockWriteManagedConfig.mockResolvedValue({
      ok: true,
      path: '/etc/nginx/servermon/app.conf',
      output: 'syntax is ok',
    });
  });

  it('requires authentication', async () => {
    mockGetSession.mockResolvedValue(null);
    const { POST } = await import('./route');

    const res = await POST(request({ mode: 'raw', fileName: 'app.conf', rawConfig: 'server {}' }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('creates a guided managed vhost config', async () => {
    const { POST } = await import('./route');

    const res = await POST(
      request({
        mode: 'guided',
        fileName: 'app.conf',
        domainPattern: 'app.example.com',
        upstreamProtocol: 'http',
        upstreamHost: '127.0.0.1',
        upstreamPort: 8912,
        redirectHttp: true,
        websocket: true,
        tlsMode: 'none',
        maxBodyMb: 32,
        timeoutSeconds: 60,
        headers: {},
      })
    );

    expect(res.status).toBe(201);
    expect(mockWriteManagedConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'app.conf',
        content: expect.stringContaining('server_name app.example.com;'),
      })
    );
  });

  it('creates a raw managed vhost config', async () => {
    const { POST } = await import('./route');

    const res = await POST(
      request({
        mode: 'raw',
        fileName: 'wildcard.conf',
        rawConfig: 'server { listen 80; server_name *.apps.example.com; }',
      })
    );

    expect(res.status).toBe(201);
    expect(mockWriteManagedConfig).toHaveBeenCalledWith({
      fileName: 'wildcard.conf',
      content: 'server { listen 80; server_name *.apps.example.com; }',
    });
  });
});
