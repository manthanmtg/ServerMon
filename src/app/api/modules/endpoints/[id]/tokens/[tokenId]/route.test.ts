/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockRevokeToken } = vi.hoisted(() => ({
  mockRevokeToken: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/endpoints/token-service', () => ({
  revokeToken: mockRevokeToken,
}));

import { DELETE } from './route';

function makeContext(id: string, tokenId: string) {
  return { params: Promise.resolve({ id, tokenId }) };
}

describe('DELETE /api/modules/endpoints/[id]/tokens/[tokenId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('revokes token and returns success', async () => {
    mockRevokeToken.mockResolvedValue(true);
    const res = await DELETE(new NextRequest('http://localhost'), makeContext('ep-1', 'tok-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('calls revokeToken with correct params', async () => {
    mockRevokeToken.mockResolvedValue(true);
    await DELETE(new NextRequest('http://localhost'), makeContext('ep-1', 'tok-abc'));
    expect(mockRevokeToken).toHaveBeenCalledWith('ep-1', 'tok-abc');
  });

  it('returns 404 when token not found', async () => {
    mockRevokeToken.mockResolvedValue(false);
    const res = await DELETE(new NextRequest('http://localhost'), makeContext('ep-1', 'tok-1'));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Token not found');
  });

  it('returns 500 on error', async () => {
    mockRevokeToken.mockRejectedValue(new Error('db error'));
    const res = await DELETE(new NextRequest('http://localhost'), makeContext('ep-1', 'tok-1'));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to revoke token');
  });
});
