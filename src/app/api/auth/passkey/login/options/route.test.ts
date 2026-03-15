/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockFindOne, mockGetPasskeyLoginOptions } = vi.hoisted(() => ({
  mockFindOne: vi.fn(),
  mockGetPasskeyLoginOptions: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/models/User', () => ({
  default: { findOne: mockFindOne },
}));
vi.mock('@/lib/passkey-utils', () => ({
  getPasskeyLoginOptions: mockGetPasskeyLoginOptions,
  getRPID: vi.fn().mockReturnValue('localhost'),
}));

import { POST } from './route';

function makeRequest(body: unknown = {}): NextRequest {
  return new NextRequest('http://localhost/api/auth/passkey/login/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', host: 'localhost' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/passkey/login/options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPasskeyLoginOptions.mockResolvedValue({
      challenge: 'login-challenge-xyz',
      timeout: 60000,
      rpId: 'localhost',
      allowCredentials: [],
    });
  });

  it('returns login options on success', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.challenge).toBe('login-challenge-xyz');
  });

  it('sets login-challenge cookie', async () => {
    const res = await POST(makeRequest());
    const cookie = res.cookies.get('login-challenge');
    expect(cookie?.value).toBe('login-challenge-xyz');
  });

  it('sets login-username cookie when username provided', async () => {
    mockFindOne.mockResolvedValue({
      passkeys: [{ credentialID: 'cred-1', transports: ['usb'] }],
    });
    const res = await POST(makeRequest({ username: 'alice' }));
    const cookie = res.cookies.get('login-username');
    expect(cookie?.value).toBe('alice');
  });

  it('does not set login-username cookie when no username', async () => {
    const res = await POST(makeRequest());
    const cookie = res.cookies.get('login-username');
    expect(cookie).toBeUndefined();
  });

  it('passes user credentials when username exists', async () => {
    const user = {
      passkeys: [
        { credentialID: 'cred-1', transports: ['usb'] },
        { credentialID: 'cred-2', transports: ['nfc'] },
      ],
    };
    mockFindOne.mockResolvedValue(user);

    await POST(makeRequest({ username: 'alice' }));
    expect(mockGetPasskeyLoginOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        allowCredentials: expect.arrayContaining([
          expect.objectContaining({ id: 'cred-1' }),
          expect.objectContaining({ id: 'cred-2' }),
        ]),
      })
    );
  });

  it('passes empty allowCredentials when user not found', async () => {
    mockFindOne.mockResolvedValue(null);
    await POST(makeRequest({ username: 'unknown' }));
    expect(mockGetPasskeyLoginOptions).toHaveBeenCalledWith(
      expect.objectContaining({ allowCredentials: [] })
    );
  });

  it('returns 500 on error', async () => {
    mockGetPasskeyLoginOptions.mockRejectedValue(new Error('crypto error'));
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to generate login options');
  });
});
