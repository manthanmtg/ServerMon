/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockCookiesSet, mockCookiesGet } = vi.hoisted(() => ({
  mockCookiesSet: vi.fn(),
  mockCookiesGet: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    set: mockCookiesSet,
    get: mockCookiesGet,
  }),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    next: vi.fn().mockReturnValue({
      cookies: { set: vi.fn() },
    }),
  },
}));

vi.mock('./session-core', () => ({
  encrypt: vi.fn().mockResolvedValue('mock.jwt.token'),
  decrypt: vi.fn().mockResolvedValue({
    user: { id: 'u1', username: 'alice', role: 'admin' },
    expires: new Date(Date.now() + 7200_000),
  }),
}));

import { login, logout, getSession, updateSession } from './session';
import { encrypt, decrypt } from './session-core';
import { NextResponse } from 'next/server';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('login()', () => {
    it('encrypts the user payload and sets the session cookie', async () => {
      const user = { id: 'u1', username: 'alice', role: 'admin' };
      await login(user);

      expect(encrypt).toHaveBeenCalledWith(
        expect.objectContaining({ user, expires: expect.any(Date) })
      );
      expect(mockCookiesSet).toHaveBeenCalledWith(
        'session',
        'mock.jwt.token',
        expect.objectContaining({ httpOnly: true, expires: expect.any(Date) })
      );
    });

    it('sets a cookie that expires approximately 2 hours from now', async () => {
      const before = Date.now();
      await login({ id: 'u2', username: 'bob', role: 'user' });
      const after = Date.now();

      const [, , options] = mockCookiesSet.mock.calls[0] as [string, string, { expires: Date }];
      const expiresMs = options.expires.getTime();

      // Should be roughly 2 hours (7200 seconds) in the future
      expect(expiresMs).toBeGreaterThanOrEqual(before + 7199_000);
      expect(expiresMs).toBeLessThanOrEqual(after + 7201_000);
    });
  });

  describe('logout()', () => {
    it('clears the session cookie by setting an empty value with an expired date', async () => {
      await logout();

      expect(mockCookiesSet).toHaveBeenCalledWith(
        'session',
        '',
        expect.objectContaining({ expires: expect.any(Date) })
      );

      const [, , options] = mockCookiesSet.mock.calls[0] as [string, string, { expires: Date }];
      // Expiry should be in the past (epoch 0)
      expect(options.expires.getTime()).toBe(0);
    });
  });

  describe('getSession()', () => {
    it('returns null when no session cookie is present', async () => {
      mockCookiesGet.mockReturnValue(undefined);

      const result = await getSession();

      expect(result).toBeNull();
      expect(decrypt).not.toHaveBeenCalled();
    });

    it('decrypts and returns the session payload when cookie exists', async () => {
      mockCookiesGet.mockReturnValue({ value: 'existing.jwt.token' });

      const result = await getSession();

      expect(decrypt).toHaveBeenCalledWith('existing.jwt.token');
      expect(result).toEqual(
        expect.objectContaining({ user: expect.objectContaining({ id: 'u1' }) })
      );
    });
  });

  describe('updateSession()', () => {
    it('returns undefined when the request has no session cookie', async () => {
      const mockRequest = {
        cookies: { get: vi.fn().mockReturnValue(undefined) },
      };

      const result = await updateSession(mockRequest as never);

      expect(result).toBeUndefined();
      expect(decrypt).not.toHaveBeenCalled();
    });

    it('decrypts the existing session and sets a refreshed cookie on the response', async () => {
      const mockCookieSet = vi.fn();
      vi.mocked(NextResponse.next).mockReturnValue({ cookies: { set: mockCookieSet } } as never);

      const mockRequest = {
        cookies: { get: vi.fn().mockReturnValue({ value: 'old.jwt.token' }) },
      };

      await updateSession(mockRequest as never);

      expect(decrypt).toHaveBeenCalledWith('old.jwt.token');
      expect(encrypt).toHaveBeenCalled();
      expect(mockCookieSet).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'session',
          value: 'mock.jwt.token',
          httpOnly: true,
          expires: expect.any(Date),
        })
      );
    });

    it('returns a NextResponse when a valid session cookie exists', async () => {
      const mockRequest = {
        cookies: { get: vi.fn().mockReturnValue({ value: 'valid.jwt.token' }) },
      };

      const result = await updateSession(mockRequest as never);

      expect(result).toBeDefined();
    });
  });
});
