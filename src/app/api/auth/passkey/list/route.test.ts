/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSession, mockFindById } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFindById: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/models/User', () => ({
  default: { findById: mockFindById },
}));

import { GET } from './route';

describe('GET /api/auth/passkey/list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns passkeys on success', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockFindById.mockResolvedValue({
      passkeys: [
        { credentialID: 'cred-1', createdAt: new Date('2024-01-01') },
        { credentialID: 'cred-2', createdAt: new Date('2024-06-01') },
      ],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.passkeys).toHaveLength(2);
    expect(json.passkeys[0].id).toBe('cred-1');
  });

  it('returns empty passkeys list', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockFindById.mockResolvedValue({ passkeys: [] });
    const res = await GET();
    const json = await res.json();
    expect(json.passkeys).toEqual([]);
  });

  it('returns 401 when no session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 401 when session has no user', async () => {
    mockGetSession.mockResolvedValue({ user: null });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when user not found', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockFindById.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('User not found');
  });

  it('returns 500 on error', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockFindById.mockRejectedValue(new Error('db error'));
    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to list passkeys');
  });
});
