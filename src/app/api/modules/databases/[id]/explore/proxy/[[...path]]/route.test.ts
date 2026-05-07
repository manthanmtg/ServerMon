/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockGetExplorerTarget } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetExplorerTarget: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/databases/service', () => ({
  buildExplorerProxyPath: (id: string) =>
    `/api/modules/databases/${encodeURIComponent(id)}/explore/proxy/`,
  getManagedDatabaseExplorerTarget: mockGetExplorerTarget,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';

describe('/api/modules/databases/[id]/explore/proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
  });

  it('preserves the explorer upstream base path for iframe root requests', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockGetExplorerTarget.mockResolvedValue({
      port: 49152,
      upstreamBasePath: '/api/modules/databases/db-1/explore/proxy/',
    });

    const res = await GET(
      new Request('http://localhost/api/modules/databases/db-1/explore/proxy/'),
      { params: Promise.resolve({ id: 'db-1' }) }
    );

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      new URL('http://127.0.0.1:49152/api/modules/databases/db-1/explore/proxy/'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('appends nested explorer paths after the upstream base path', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockGetExplorerTarget.mockResolvedValue({
      port: 49152,
      upstreamBasePath: '/api/modules/databases/db-1/explore/proxy/',
    });

    await GET(new Request('http://localhost/api/modules/databases/db-1/explore/proxy/status?x=1'), {
      params: Promise.resolve({ id: 'db-1', path: ['status'] }),
    });

    expect(global.fetch).toHaveBeenCalledWith(
      new URL('http://127.0.0.1:49152/api/modules/databases/db-1/explore/proxy/status?x=1'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('rewrites root-relative explorer redirects back through the proxy', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockGetExplorerTarget.mockResolvedValue({
      port: 49152,
      upstreamBasePath: undefined,
    });
    global.fetch = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: '/index.php?route=/' },
      })
    );

    const res = await GET(
      new Request('http://localhost/api/modules/databases/db-1/explore/proxy/'),
      { params: Promise.resolve({ id: 'db-1' }) }
    );

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(
      'http://localhost/api/modules/databases/db-1/explore/proxy/index.php?route=/'
    );
  });

  it('keeps prefixed explorer redirects on the public proxy path', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockGetExplorerTarget.mockResolvedValue({
      port: 49152,
      upstreamBasePath: '/api/modules/databases/db-1/explore/proxy/',
    });
    global.fetch = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: {
          location: '/api/modules/databases/db-1/explore/proxy/login?next=%2F',
        },
      })
    );

    const res = await GET(
      new Request('http://localhost/api/modules/databases/db-1/explore/proxy/'),
      { params: Promise.resolve({ id: 'db-1' }) }
    );

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(
      'http://localhost/api/modules/databases/db-1/explore/proxy/login?next=%2F'
    );
  });
});
