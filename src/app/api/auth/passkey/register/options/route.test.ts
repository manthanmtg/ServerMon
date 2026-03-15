/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetSession, mockFindById, mockGetPasskeyRegistrationOptions } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFindById: vi.fn(),
  mockGetPasskeyRegistrationOptions: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/models/User', () => ({
  default: { findById: mockFindById },
}));
vi.mock('@/lib/passkey-utils', () => ({
  getPasskeyRegistrationOptions: mockGetPasskeyRegistrationOptions,
  getRPID: vi.fn().mockReturnValue('localhost'),
  RP_NAME: 'ServerMon',
}));

import { GET } from './route';

function makeRequest(host = 'localhost'): NextRequest {
  return new NextRequest('http://localhost/api/auth/passkey/register/options', {
    headers: { host },
  });
}

const mockUser = {
  _id: { toString: () => 'user-1' },
  username: 'alice',
  passkeys: [],
};

describe('GET /api/auth/passkey/register/options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockFindById.mockResolvedValue(mockUser);
    mockGetPasskeyRegistrationOptions.mockResolvedValue({
      challenge: 'mock-challenge-abc',
      rp: { name: 'ServerMon', id: 'localhost' },
      user: { id: 'user-1', name: 'alice', displayName: 'alice' },
      pubKeyCredParams: [],
      timeout: 60000,
    });
  });

  it('returns registration options on success', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.challenge).toBe('mock-challenge-abc');
  });

  it('sets reg-challenge cookie', async () => {
    const res = await GET(makeRequest());
    const cookie = res.cookies.get('reg-challenge');
    expect(cookie?.value).toBe('mock-challenge-abc');
  });

  it('returns 401 when no session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 401 when session has no user', async () => {
    mockGetSession.mockResolvedValue({ user: null });
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 404 when user not found', async () => {
    mockFindById.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('User not found');
  });

  it('excludes existing passkeys from options', async () => {
    mockFindById.mockResolvedValue({
      ...mockUser,
      passkeys: [{ credentialID: 'cred-1', transports: ['usb'] }],
    });
    await GET(makeRequest());
    expect(mockGetPasskeyRegistrationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeCredentials: expect.arrayContaining([expect.objectContaining({ id: 'cred-1' })]),
      })
    );
  });

  it('returns 500 on error', async () => {
    mockGetPasskeyRegistrationOptions.mockRejectedValue(new Error('crypto error'));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to generate registration options');
  });
});
