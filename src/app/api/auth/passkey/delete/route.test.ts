/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

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

import { DELETE } from './route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/auth/passkey/delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const mockSave = vi.fn().mockResolvedValue(undefined);

describe('DELETE /api/auth/passkey/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockFindById.mockResolvedValue({
      passkeys: [{ credentialID: 'cred-1' }, { credentialID: 'cred-2' }],
      save: mockSave,
    });
  });

  it('deletes passkey and returns success', async () => {
    const user = {
      passkeys: [{ credentialID: 'cred-1' }, { credentialID: 'cred-2' }],
      save: mockSave,
    };
    mockFindById.mockResolvedValue(user);

    const res = await DELETE(makeRequest({ credentialID: 'cred-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(user.passkeys).toHaveLength(1);
    expect(user.passkeys[0].credentialID).toBe('cred-2');
  });

  it('saves after filtering passkeys', async () => {
    await DELETE(makeRequest({ credentialID: 'cred-1' }));
    expect(mockSave).toHaveBeenCalled();
  });

  it('returns 401 when no session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await DELETE(makeRequest({ credentialID: 'cred-1' }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 400 when credentialID is missing', async () => {
    const res = await DELETE(makeRequest({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Credential ID required');
  });

  it('returns 404 when user not found', async () => {
    mockFindById.mockResolvedValue(null);
    const res = await DELETE(makeRequest({ credentialID: 'cred-1' }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('User not found');
  });

  it('returns 500 on error', async () => {
    mockFindById.mockRejectedValue(new Error('db error'));
    const res = await DELETE(makeRequest({ credentialID: 'cred-1' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to delete passkey');
  });
});
