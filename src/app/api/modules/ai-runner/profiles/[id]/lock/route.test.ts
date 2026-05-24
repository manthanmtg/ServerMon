/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockLockProfile, mockLogError } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockLockProfile: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSession: mockGetSession,
}));

vi.mock('@/lib/ai-runner/service', () => ({
  getAIRunnerService: () => ({
    lockProfile: mockLockProfile,
  }),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: mockLogError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { POST } from './route';

function makeRequest(body: unknown, options: { method?: string; body?: string } = {}) {
  if (typeof options.body === 'string') {
    return new Request('http://localhost/api/modules/ai-runner/profiles/p1/lock', {
      method: options.method ?? 'POST',
      body: options.body,
    });
  }

  return new Request('http://localhost/api/modules/ai-runner/profiles/p1/lock', {
    method: options.method ?? 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/modules/ai-runner/profiles/[id]/lock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { id: 'runner-admin' } } as never);
  });

  it('returns 401 when no session exists', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await POST(makeRequest({ locked: true }), {
      params: Promise.resolve({ id: 'profile-1' }),
    });

    expect(response.status).toBe(401);
    expect(mockLockProfile).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('validates and rejects a past lockedUntil value', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const response = await POST(makeRequest({ locked: true, lockedUntil: past }), {
      params: Promise.resolve({ id: 'profile-1' }),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Lock expiry must be in the future');
    expect(mockLockProfile).not.toHaveBeenCalled();
  });

  it('returns 404 when the profile is not found', async () => {
    mockLockProfile.mockResolvedValue(null);

    const response = await POST(makeRequest({ locked: true }), {
      params: Promise.resolve({ id: 'missing-profile' }),
    });

    expect(response.status).toBe(404);
    expect(mockLockProfile).toHaveBeenCalledWith('missing-profile', { locked: true });
    expect(await response.json()).toEqual({ error: 'Profile not found' });
  });

  it('locks a profile with an explicit expiry', async () => {
    const lockedUntil = new Date(Date.now() + 120_000).toISOString();
    const mockProfile = {
      _id: 'profile-1',
      name: 'demo',
      locked: true,
      lockedUntil,
    };
    mockLockProfile.mockResolvedValue(mockProfile as never);

    const response = await POST(makeRequest({ locked: true, lockedUntil }), {
      params: Promise.resolve({ id: 'profile-1' }),
    });

    expect(response.status).toBe(200);
    expect(mockLockProfile).toHaveBeenCalledWith('profile-1', {
      locked: true,
      lockedUntil,
    });
    expect(await response.json()).toEqual(mockProfile);
  });

  it('unlocks a profile and clears expiration', async () => {
    const mockProfile = { _id: 'profile-1', name: 'demo', locked: false };
    mockLockProfile.mockResolvedValue(mockProfile as never);

    const response = await POST(makeRequest({ locked: false, lockedUntil: null }), {
      params: Promise.resolve({ id: 'profile-1' }),
    });

    expect(response.status).toBe(200);
    expect(mockLockProfile).toHaveBeenCalledWith('profile-1', {
      locked: false,
      lockedUntil: null,
    });
    expect(await response.json()).toEqual(mockProfile);
  });

  it('returns a 400 error with message from thrown Error', async () => {
    mockLockProfile.mockRejectedValue(new Error('db unavailable'));

    const response = await POST(makeRequest({ locked: true }), {
      params: Promise.resolve({ id: 'profile-1' }),
    });

    expect(response.status).toBe(400);
    expect(mockLogError).toHaveBeenCalledWith('Failed to update AI runner profile lock', expect.any(Error));
    expect(await response.json()).toEqual({ error: 'db unavailable' });
  });

  it('returns a 400 error with generic message for non-Error throws', async () => {
    mockLockProfile.mockRejectedValue('boom');

    const response = await POST(makeRequest({ locked: true }), {
      params: Promise.resolve({ id: 'profile-1' }),
    });

    expect(response.status).toBe(400);
    expect(mockLogError).toHaveBeenCalledWith('Failed to update AI runner profile lock', 'boom');
    expect(await response.json()).toEqual({ error: 'Failed to update profile lock' });
  });

  it('returns an error when JSON body is invalid', async () => {
    const response = await POST(makeRequest({}, { body: 'not-json' }), {
      params: Promise.resolve({ id: 'profile-1' }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/^Unexpected token/);
    expect(mockLockProfile).not.toHaveBeenCalled();
  });
});
