/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockNodeFind, mockVerifyToken } = vi.hoisted(() => ({
  mockNodeFind: vi.fn(),
  mockVerifyToken: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/fleet/pairing', () => ({
  verifyPairingToken: mockVerifyToken,
}));
vi.mock('@/models/Node', () => ({
  default: { find: mockNodeFind },
}));

import { GET } from './route';

function makeReq(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/fleet/install');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

describe('GET /api/fleet/install', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('401 without token', async () => {
    const res = await GET(makeReq({}));
    expect(res.status).toBe(401);
  });

  it('401 when no matching prefix', async () => {
    mockNodeFind.mockResolvedValue([]);
    const res = await GET(makeReq({ token: 'abc12345rest' }));
    expect(res.status).toBe(401);
  });

  it('401 when verify fails', async () => {
    mockNodeFind.mockResolvedValue([
      {
        _id: 'n1',
        pairingTokenHash: 'hash-1',
        pairingTokenPrefix: 'abc12345',
      },
    ]);
    mockVerifyToken.mockResolvedValue(false);
    const res = await GET(makeReq({ token: 'abc12345rest' }));
    expect(res.status).toBe(401);
  });

  it('returns linux shell script when verify passes', async () => {
    mockNodeFind.mockResolvedValue([
      {
        _id: 'n1',
        pairingTokenHash: 'hash-1',
        pairingTokenPrefix: 'abc12345',
      },
    ]);
    mockVerifyToken.mockResolvedValue(true);
    const res = await GET(makeReq({ token: 'abc12345rest' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/x-shellscript');
    const body = await res.text();
    expect(body).toContain('install-agent.sh');
    expect(body).toContain('--node-id');
  });

  it('returns plain text for docker', async () => {
    mockNodeFind.mockResolvedValue([
      {
        _id: 'n1',
        pairingTokenHash: 'hash-1',
        pairingTokenPrefix: 'abc12345',
      },
    ]);
    mockVerifyToken.mockResolvedValue(true);
    const res = await GET(makeReq({ token: 'abc12345rest', kind: 'docker' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain');
    const body = await res.text();
    expect(body).toContain('docker run');
  });
});
