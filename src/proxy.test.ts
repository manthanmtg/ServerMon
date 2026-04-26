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

vi.mock('@/lib/session', () => ({
  decrypt: mockDecrypt,
  updateSession: mockUpdateSession,
}));

function makeRequest(pathname: string, sessionCookie?: string) {
  const nextUrl = new URL(`http://localhost${pathname}`);

  return {
    nextUrl,
    url: nextUrl.toString(),
    cookies: {
      get: vi.fn().mockReturnValue(sessionCookie ? { value: sessionCookie } : undefined),
    },
  };
}

describe('proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNext.mockReturnValue({ type: 'next' });
    mockJson.mockReturnValue({ type: 'json' });
    mockRedirect.mockReturnValue({ type: 'redirect' });
    mockUpdateSession.mockResolvedValue({ type: 'refreshed' });
  });

  it('redirects protected pages to /login when no session exists', async () => {
    const middleware = (await import('./proxy')).default;
    const request = makeRequest('/dashboard');

    const response = await middleware(request as never);

    expect(mockRedirect).toHaveBeenCalled();
    expect(response).toEqual({ type: 'redirect' });
  });

  it('returns 401 for protected API routes when no session exists', async () => {
    const middleware = (await import('./proxy')).default;
    const request = makeRequest('/api/modules/network');

    const response = await middleware(request as never);

    expect(mockJson).toHaveBeenCalledWith({ error: 'Unauthorized' }, { status: 401 });
    expect(response).toEqual({ type: 'json' });
  });

  it('redirects authenticated users away from /login', async () => {
    mockDecrypt.mockResolvedValue({ user: { id: 'u1' } });

    const middleware = (await import('./proxy')).default;
    const request = makeRequest('/login', 'valid-token');

    const response = await middleware(request as never);

    expect(mockRedirect).toHaveBeenCalled();
    expect(response).toEqual({ type: 'redirect' });
  });

  it('refreshes the session on protected authenticated requests', async () => {
    mockDecrypt.mockResolvedValue({ user: { id: 'u1' } });

    const middleware = (await import('./proxy')).default;
    const request = makeRequest('/dashboard', 'valid-token');

    const response = await middleware(request as never);

    expect(mockUpdateSession).toHaveBeenCalledWith(request);
    expect(response).toEqual({ type: 'refreshed' });
  });

  it('does not refresh sessions for public API routes', async () => {
    mockDecrypt.mockResolvedValue({ user: { id: 'u1' } });

    const middleware = (await import('./proxy')).default;
    const request = makeRequest('/api/auth/logout', 'valid-token');

    const response = await middleware(request as never);

    expect(mockUpdateSession).not.toHaveBeenCalled();
    expect(response).toEqual({ type: 'next' });
  });

  it('redirects legacy favicon requests to the branding icon', async () => {
    const middleware = (await import('./proxy')).default;
    const request = makeRequest('/favicon.ico');

    const response = await middleware(request as never);

    expect(mockRedirect).toHaveBeenCalledWith(
      new URL('http://localhost/api/settings/branding/icon')
    );
    expect(mockJson).not.toHaveBeenCalled();
    expect(mockUpdateSession).not.toHaveBeenCalled();
    expect(response).toEqual({ type: 'redirect' });
  });
});
