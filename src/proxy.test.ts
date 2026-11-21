/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockJson = vi.fn();
const mockRedirect = vi.fn();
const mockNext = vi.fn();
const mockDecrypt = vi.fn();
const mockUpdateSession = vi.fn();

vi.mock('next/server', () => ({
  NextResponse: {
    json: mockJson,
    redirect: mockRedirect,
    next: mockNext,
  },
}));

vi.mock('@/lib/session-core', () => ({
  decrypt: mockDecrypt,
}));

vi.mock('@/lib/session', () => ({
  updateSession: mockUpdateSession,
}));

function makeRequest(pathname: string, sessionCookie?: string) {
  const nextUrl = new URL(`http://localhost${pathname}`);

  return {
    nextUrl,
    cookies: {
      get: vi.fn().mockReturnValue(sessionCookie ? { value: sessionCookie } : undefined),
    },
  };
}

describe('proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJson.mockReturnValue({ type: 'json' });
    mockRedirect.mockReturnValue({ type: 'redirect' });
    mockNext.mockReturnValue({ type: 'next' });
    mockUpdateSession.mockResolvedValue({ type: 'refreshed' });
  });

  it('rejects anonymous requests to protected API routes before their handlers run', async () => {
    const { proxy } = await import('./proxy');

    const response = await proxy(makeRequest('/api/modules/self-service/install') as never);

    expect(mockJson).toHaveBeenCalledWith({ error: 'Unauthorized' }, { status: 401 });
    expect(response).toEqual({ type: 'json' });
  });

  it('redirects anonymous requests to protected pages to login', async () => {
    const { proxy } = await import('./proxy');

    const response = await proxy(makeRequest('/dashboard') as never);

    expect(mockRedirect).toHaveBeenCalledWith(new URL('http://localhost/login'));
    expect(response).toEqual({ type: 'redirect' });
  });

  it('leaves public token and bootstrap APIs for their route handlers to authenticate', async () => {
    const { proxy } = await import('./proxy');

    const response = await proxy(makeRequest('/api/fleet/nodes/node-1/heartbeat') as never);

    expect(mockDecrypt).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalled();
    expect(response).toEqual({ type: 'next' });
  });

  it('refreshes valid sessions for protected requests', async () => {
    mockDecrypt.mockResolvedValue({ user: { id: 'u1' } });
    const { proxy } = await import('./proxy');
    const request = makeRequest('/dashboard', 'valid-token');

    const response = await proxy(request as never);

    expect(mockUpdateSession).toHaveBeenCalledWith(request);
    expect(response).toEqual({ type: 'refreshed' });
  });
});
