/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockConnectDB, mockCountDocuments, mockUserCreate, mockHashPassword, mockVerifyTOTPToken } =
  vi.hoisted(() => ({
    mockConnectDB: vi.fn().mockResolvedValue(undefined),
    mockCountDocuments: vi.fn(),
    mockUserCreate: vi.fn(),
    mockHashPassword: vi.fn(),
    mockVerifyTOTPToken: vi.fn(),
  }));

vi.mock('@/lib/db', () => ({ default: mockConnectDB }));
vi.mock('@/models/User', () => ({
  default: {
    countDocuments: mockCountDocuments,
    create: mockUserCreate,
  },
}));
vi.mock('@/lib/auth-utils', () => ({
  hashPassword: mockHashPassword,
  verifyTOTPToken: mockVerifyTOTPToken,
}));

import { POST } from './route';
import { NextRequest } from 'next/server';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/setup/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/setup/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when already set up', async () => {
    mockCountDocuments.mockResolvedValue(1);
    const res = await POST(
      makeRequest({ username: 'admin', password: 'pass', totpSecret: 'SEC', totpToken: '123456' })
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid TOTP token', async () => {
    mockCountDocuments.mockResolvedValue(0);
    mockVerifyTOTPToken.mockReturnValue(false);
    const res = await POST(
      makeRequest({ username: 'admin', password: 'pass', totpSecret: 'SEC', totpToken: '000000' })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid verification code');
  });

  it('creates admin user on valid setup', async () => {
    mockCountDocuments.mockResolvedValue(0);
    mockVerifyTOTPToken.mockReturnValue(true);
    mockHashPassword.mockResolvedValue('hashed-password');
    mockUserCreate.mockResolvedValue({ _id: 'user-1' });
    const res = await POST(
      makeRequest({
        username: 'admin',
        password: 'secret',
        totpSecret: 'TOTP_SECRET',
        totpToken: '123456',
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.userId).toBe('user-1');
  });

  it('creates admin with correct role', async () => {
    mockCountDocuments.mockResolvedValue(0);
    mockVerifyTOTPToken.mockReturnValue(true);
    mockHashPassword.mockResolvedValue('hashed');
    mockUserCreate.mockResolvedValue({ _id: 'uid' });
    await POST(
      makeRequest({ username: 'admin', password: 'pass', totpSecret: 'S', totpToken: '1' })
    );
    expect(mockUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'admin',
        totpEnabled: true,
      })
    );
  });

  it('returns 500 on unexpected error', async () => {
    mockCountDocuments.mockRejectedValue(new Error('db error'));
    const res = await POST(makeRequest({ username: 'admin' }));
    expect(res.status).toBe(500);
  });
});
