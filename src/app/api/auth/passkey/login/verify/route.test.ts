/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockFindOne, mockVerifyPasskeyLogin, mockLogin } = vi.hoisted(() => ({
  mockFindOne: vi.fn(),
  mockVerifyPasskeyLogin: vi.fn(),
  mockLogin: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  default: vi.fn().mockResolvedValue({ connection: { name: 'testdb' } }),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/models/User', () => ({
  default: { findOne: mockFindOne },
}));
vi.mock('@/lib/passkey-utils', () => ({
  verifyPasskeyLogin: mockVerifyPasskeyLogin,
  getRPID: vi.fn().mockReturnValue('localhost'),
  getOrigin: vi.fn().mockReturnValue('http://localhost'),
}));
vi.mock('@/lib/session', () => ({ login: mockLogin }));

import { POST } from './route';

function makeRequest(body: unknown, challenge?: string): NextRequest {
  const req = new NextRequest('http://localhost/api/auth/passkey/login/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', host: 'localhost' },
    body: JSON.stringify(body),
  });
  if (challenge) {
    req.cookies.set('login-challenge', challenge);
  }
  return req;
}

const mockPasskey = {
  credentialID: 'cred-1',
  publicKey: Buffer.from([1, 2, 3]),
  counter: 0,
  transports: ['usb'],
};

const mockUser = {
  _id: { toString: () => 'user-1' },
  username: 'alice',
  role: 'admin',
  passkeys: [mockPasskey],
  lastLoginAt: null as Date | null,
  save: vi.fn().mockResolvedValue(undefined),
};

const loginBody = { id: 'cred-1', response: {} };

describe('POST /api/auth/passkey/login/verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindOne.mockResolvedValue({ ...mockUser, passkeys: [{ ...mockPasskey }] });
    mockVerifyPasskeyLogin.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 1 },
    });
    mockLogin.mockResolvedValue(undefined);
  });

  it('returns success when verification passes', async () => {
    const req = makeRequest(loginBody, 'challenge-xyz');
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('creates session on successful login', async () => {
    const req = makeRequest(loginBody, 'challenge-xyz');
    await POST(req);
    expect(mockLogin).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user-1',
        username: 'alice',
        role: 'admin',
      })
    );
  });

  it('returns 400 when challenge cookie is missing', async () => {
    const res = await POST(makeRequest(loginBody));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('challenge');
  });

  it('returns 404 when user not found', async () => {
    mockFindOne.mockResolvedValue(null);
    const req = makeRequest(loginBody, 'challenge-xyz');
    const res = await POST(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('User not found');
  });

  it('returns 400 when passkey not on user', async () => {
    mockFindOne.mockResolvedValue({
      ...mockUser,
      passkeys: [{ ...mockPasskey, credentialID: 'different-cred' }],
    });
    const req = makeRequest(loginBody, 'challenge-xyz');
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Passkey not found on user');
  });

  it('returns 401 when verification fails', async () => {
    mockVerifyPasskeyLogin.mockResolvedValue({ verified: false });
    const req = makeRequest(loginBody, 'challenge-xyz');
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Verification failed');
  });

  it('returns 500 on unexpected error', async () => {
    mockVerifyPasskeyLogin.mockRejectedValue(new Error('crypto error'));
    const req = makeRequest(loginBody, 'challenge-xyz');
    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to verify login');
  });

  it('clears challenge and username cookies on success', async () => {
    const req = makeRequest(loginBody, 'challenge-xyz');
    const res = await POST(req);
    expect(res.status).toBe(200);
    // Cookies that were deleted should not be present in response
    const challengeCookie = res.cookies.get('login-challenge');
    const usernameCookie = res.cookies.get('login-username');
    // After deletion, cookies either are absent or have maxAge=0/expired
    expect(challengeCookie?.value ?? '').toBe('');
    expect(usernameCookie?.value ?? '').toBe('');
  });
});
