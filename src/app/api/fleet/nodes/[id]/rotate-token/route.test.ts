/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetSession,
  mockFindById,
  mockFleetLogCreate,
  mockGeneratePairingToken,
  mockHashPairingToken,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFindById: vi.fn(),
  mockFleetLogCreate: vi.fn(),
  mockGeneratePairingToken: vi.fn(),
  mockHashPairingToken: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/fleet/pairing', () => ({
  generatePairingToken: mockGeneratePairingToken,
  hashPairingToken: mockHashPairingToken,
}));
vi.mock('@/models/Node', () => ({
  default: { findById: mockFindById },
}));
vi.mock('@/models/FleetLogEvent', () => ({
  default: { create: mockFleetLogCreate },
}));

import { POST } from './route';

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/fleet/nodes/node-1/rotate-token', {
    method: 'POST',
  });
}

describe('POST /api/fleet/nodes/[id]/rotate-token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFleetLogCreate.mockResolvedValue({});
    mockGeneratePairingToken.mockReturnValue('new-token-xyzzy01234567');
    mockHashPairingToken.mockResolvedValue('new-hash');
  });

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeReq(), makeContext('node-1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for viewer role', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'v', role: 'user' } });
    const res = await POST(makeReq(), makeContext('node-1'));
    expect(res.status).toBe(403);
  });

  it('returns 403 for operator role (admin-only capability)', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'op', role: 'operator' } });
    const res = await POST(makeReq(), makeContext('node-1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when node missing', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    mockFindById.mockResolvedValue(null);
    const res = await POST(makeReq(), makeContext('node-1'));
    expect(res.status).toBe(404);
  });

  it('rotates token, resets verification state, and emits audit', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const nodeDoc = {
      pairingTokenHash: 'old-hash',
      pairingTokenPrefix: 'old',
      pairingIssuedAt: new Date('2020-01-01'),
      pairingVerifiedAt: new Date('2020-02-01'),
      status: 'online',
      save: saveFn,
    };
    mockFindById.mockResolvedValue(nodeDoc);

    const res = await POST(makeReq(), makeContext('node-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.pairingToken).toBe('new-token-xyzzy01234567');

    expect(nodeDoc.pairingTokenHash).toBe('new-hash');
    expect(nodeDoc.pairingTokenPrefix).toBe('new-toke');
    expect(nodeDoc.pairingVerifiedAt).toBeNull();
    expect(nodeDoc.status).toBe('unpaired');
    expect(saveFn).toHaveBeenCalled();
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'node.rotate_token', audit: true })
    );
  });
});
