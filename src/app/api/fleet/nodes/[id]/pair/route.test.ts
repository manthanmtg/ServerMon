/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockFindById, mockFrpFindOne, mockFleetLogCreate, mockVerifyPairingToken } = vi.hoisted(
  () => ({
    mockFindById: vi.fn(),
    mockFrpFindOne: vi.fn(),
    mockFleetLogCreate: vi.fn(),
    mockVerifyPairingToken: vi.fn(),
  })
);

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/fleet/pairing', () => ({
  verifyPairingToken: mockVerifyPairingToken,
}));
vi.mock('@/models/Node', () => ({
  default: { findById: mockFindById },
}));
vi.mock('@/models/FleetLogEvent', () => ({
  default: { create: mockFleetLogCreate },
}));
vi.mock('@/models/FrpServerState', () => ({
  default: { findOne: mockFrpFindOne },
}));

import { POST } from './route';

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeReq(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/fleet/nodes/node-1/pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('POST /api/fleet/nodes/[id]/pair', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFleetLogCreate.mockResolvedValue({});
    mockFrpFindOne.mockResolvedValue({
      key: 'global',
      enabled: true,
      bindPort: 7000,
      subdomainHost: 'hub.example.com',
    });
    delete process.env.FLEET_HUB_AUTH_TOKEN;
    delete process.env.FLEET_HUB_PUBLIC_URL;
  });

  it('returns 401 without an Authorization header', async () => {
    const res = await POST(makeReq(), makeContext('node-1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when token is malformed', async () => {
    const res = await POST(makeReq({ Authorization: 'Basic abc' }), makeContext('node-1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when node is missing', async () => {
    mockFindById.mockResolvedValue(null);
    const res = await POST(makeReq({ Authorization: 'Bearer tok' }), makeContext('node-1'));
    expect(res.status).toBe(404);
  });

  it('returns 401 when token does not verify', async () => {
    mockFindById.mockResolvedValue({
      pairingTokenHash: 'hash',
      save: vi.fn().mockResolvedValue(undefined),
    });
    mockVerifyPairingToken.mockResolvedValue(false);
    const res = await POST(makeReq({ Authorization: 'Bearer wrong' }), makeContext('node-1'));
    expect(res.status).toBe(401);
  });

  it('returns 503 when frp server is missing or disabled', async () => {
    mockFindById.mockResolvedValue({
      pairingTokenHash: 'hash',
      save: vi.fn().mockResolvedValue(undefined),
    });
    mockVerifyPairingToken.mockResolvedValue(true);
    mockFrpFindOne.mockResolvedValue({ enabled: false });
    const res = await POST(makeReq({ Authorization: 'Bearer tok' }), makeContext('node-1'));
    expect(res.status).toBe(503);
  });

  it('returns 200 with hub details on correct token', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const nodeDoc = {
      pairingTokenHash: 'hash',
      save: saveFn,
      status: 'unpaired',
      tunnelStatus: 'disconnected',
      pairingVerifiedAt: null,
    };
    mockFindById.mockResolvedValue(nodeDoc);
    mockVerifyPairingToken.mockResolvedValue(true);
    process.env.FLEET_HUB_AUTH_TOKEN = 'env-token';
    process.env.FLEET_HUB_PUBLIC_URL = 'https://hub.example.com';

    const res = await POST(makeReq({ Authorization: 'Bearer tok' }), makeContext('node-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.hub.authToken).toBe('env-token');
    // serverAddr must be hostname-only (no scheme) so frpc can dial it as a TCP host.
    expect(json.hub.serverAddr).toBe('hub.example.com');
    expect(json.hub.serverPort).toBe(7000);
    expect(json.hub.subdomainHost).toBe('hub.example.com');

    expect(nodeDoc.status).toBe('connecting');
    expect(nodeDoc.tunnelStatus).toBe('disconnected');
    expect(nodeDoc.pairingVerifiedAt).toBeInstanceOf(Date);
    expect(saveFn).toHaveBeenCalled();
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'node.pair_verified', audit: true })
    );
  });
});
