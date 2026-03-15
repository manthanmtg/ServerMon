/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockConnectDB, mockFindOne, mockVerifyPassword } = vi.hoisted(() => ({
  mockConnectDB: vi.fn().mockResolvedValue(undefined),
  mockFindOne: vi.fn(),
  mockVerifyPassword: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: mockConnectDB }));
vi.mock('@/models/User', () => ({
  default: { findOne: mockFindOne },
}));
vi.mock('@/lib/auth-utils', () => ({
  verifyPassword: mockVerifyPassword,
}));

import { POST, GET } from './route';
import { NextRequest } from 'next/server';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when user not found', async () => {
    mockFindOne.mockResolvedValue(null);
    const res = await POST(makeRequest({ username: 'admin', password: 'wrong' }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Invalid credentials');
  });

  it('returns 401 for wrong password', async () => {
    mockFindOne.mockResolvedValue({ username: 'admin', passwordHash: 'hash', totpEnabled: false });
    mockVerifyPassword.mockResolvedValue(false);
    const res = await POST(makeRequest({ username: 'admin', password: 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('returns success with totpEnabled=false for non-TOTP user', async () => {
    mockFindOne.mockResolvedValue({ username: 'admin', passwordHash: 'hash', totpEnabled: false });
    mockVerifyPassword.mockResolvedValue(true);
    const res = await POST(makeRequest({ username: 'admin', password: 'correct' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.requiresTOTP).toBe(false);
  });

  it('returns success with requiresTOTP=true for TOTP user', async () => {
    mockFindOne.mockResolvedValue({ username: 'admin', passwordHash: 'hash', totpEnabled: true });
    mockVerifyPassword.mockResolvedValue(true);
    const res = await POST(makeRequest({ username: 'admin', password: 'correct' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.requiresTOTP).toBe(true);
  });

  it('returns 500 on unexpected error', async () => {
    mockFindOne.mockRejectedValue(new Error('db error'));
    const res = await POST(makeRequest({ username: 'admin', password: 'pass' }));
    expect(res.status).toBe(500);
  });
});

describe('GET /api/auth/verify', () => {
  it('returns 405 Method not allowed', async () => {
    const res = await GET();
    expect(res.status).toBe(405);
    const json = await res.json();
    expect(json.error).toBe('Method not allowed');
  });
});
