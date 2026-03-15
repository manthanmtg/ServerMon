/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetSession, mockFindById, mockVerifyPasskeyRegistration } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFindById: vi.fn(),
  mockVerifyPasskeyRegistration: vi.fn(),
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
  verifyPasskeyRegistration: mockVerifyPasskeyRegistration,
  getRPID: vi.fn().mockReturnValue('localhost'),
  getOrigin: vi.fn().mockReturnValue('http://localhost'),
}));

import { POST } from './route';

function makeRequest(body: unknown, challenge?: string): NextRequest {
  const req = new NextRequest('http://localhost/api/auth/passkey/register/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', host: 'localhost' },
    body: JSON.stringify(body),
  });
  if (challenge) {
    req.cookies.set('reg-challenge', challenge);
  }
  return req;
}

const mockSave = vi.fn().mockResolvedValue(undefined);
const mockMarkModified = vi.fn();
const mockUser = {
  _id: { toString: () => 'user-1' },
  username: 'alice',
  passkeys: [] as {
    credentialID: string;
    publicKey: Buffer;
    counter: number;
    transports: string[];
    createdAt: Date;
  }[],
  save: mockSave,
  markModified: mockMarkModified,
};

const verifyBody = {
  id: 'cred-new',
  response: { transports: ['usb'] },
};

describe('POST /api/auth/passkey/register/verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockFindById.mockResolvedValue({ ...mockUser, passkeys: [] });
    mockVerifyPasskeyRegistration.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'cred-new',
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
        },
      },
    });
  });

  it('returns success when verification passes', async () => {
    const req = makeRequest(verifyBody, 'challenge-abc');
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('returns 401 when no session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeRequest(verifyBody, 'challenge-abc'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when challenge cookie is missing', async () => {
    const res = await POST(makeRequest(verifyBody));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('challenge');
  });

  it('returns 404 when user not found', async () => {
    mockFindById.mockResolvedValue(null);
    const req = makeRequest(verifyBody, 'challenge-abc');
    const res = await POST(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('User not found');
  });

  it('returns 400 when verification fails', async () => {
    mockVerifyPasskeyRegistration.mockResolvedValue({ verified: false });
    const req = makeRequest(verifyBody, 'challenge-abc');
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Verification failed');
  });

  it('does not add duplicate credential', async () => {
    const user = {
      ...mockUser,
      passkeys: [
        {
          credentialID: 'cred-new',
          publicKey: Buffer.from([1]),
          counter: 0,
          transports: [],
          createdAt: new Date(),
        },
      ],
    };
    mockFindById.mockResolvedValue(user);
    const req = makeRequest(verifyBody, 'challenge-abc');
    const res = await POST(req);
    expect(res.status).toBe(200);
    // passkeys length should remain 1
    expect(user.passkeys).toHaveLength(1);
  });

  it('returns 500 on error', async () => {
    mockVerifyPasskeyRegistration.mockRejectedValue(new Error('crypto error'));
    const req = makeRequest(verifyBody, 'challenge-abc');
    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to verify registration');
  });
});
