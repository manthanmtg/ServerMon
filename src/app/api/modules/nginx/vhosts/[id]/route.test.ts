/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetSession, mockWriteManagedConfig, mockDeleteManagedConfig } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockWriteManagedConfig: vi.fn(),
  mockDeleteManagedConfig: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSession: mockGetSession,
}));

vi.mock('@/lib/nginx/managed-config', () => ({
  writeManagedConfig: mockWriteManagedConfig,
  deleteManagedConfig: mockDeleteManagedConfig,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

function request(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/modules/nginx/vhosts/life.conf', {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('/api/modules/nginx/vhosts/[id]', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    mockWriteManagedConfig.mockResolvedValue({
      ok: true,
      path: '/etc/nginx/servermon/life.conf',
      output: 'syntax is ok',
    });
    mockDeleteManagedConfig.mockResolvedValue({
      ok: true,
      path: '/etc/nginx/servermon/life.conf',
      output: 'syntax is ok',
    });
  });

  it('updates a managed raw config using the route id as the file name', async () => {
    const { PATCH } = await import('./route');

    const res = await PATCH(request('PATCH', { mode: 'raw', rawConfig: 'server {}' }), {
      params: Promise.resolve({ id: 'life.conf' }),
    });

    expect(res.status).toBe(200);
    expect(mockWriteManagedConfig).toHaveBeenCalledWith({
      fileName: 'life.conf',
      content: 'server {}',
    });
  });

  it('deletes a managed config using the route id as the file name', async () => {
    const { DELETE } = await import('./route');

    const res = await DELETE(request('DELETE'), {
      params: Promise.resolve({ id: 'life.conf' }),
    });

    expect(res.status).toBe(200);
    expect(mockDeleteManagedConfig).toHaveBeenCalledWith('life.conf');
  });
});
