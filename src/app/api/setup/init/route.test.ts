/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockConnectDB, mockCountDocuments, mockGenerateTOTPSecret, mockGenerateQRCode } =
  vi.hoisted(() => ({
    mockConnectDB: vi.fn().mockResolvedValue(undefined),
    mockCountDocuments: vi.fn(),
    mockGenerateTOTPSecret: vi.fn(),
    mockGenerateQRCode: vi.fn(),
  }));

vi.mock('@/lib/db', () => ({ default: mockConnectDB }));
vi.mock('@/models/User', () => ({
  default: { countDocuments: mockCountDocuments },
}));
vi.mock('@/lib/auth-utils', () => ({
  generateTOTPSecret: mockGenerateTOTPSecret,
  generateQRCode: mockGenerateQRCode,
}));

import { POST } from './route';
import { NextRequest } from 'next/server';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/setup/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/setup/init', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when system already set up', async () => {
    mockCountDocuments.mockResolvedValue(1);
    const res = await POST(makeRequest({ username: 'admin' }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain('already setup');
  });

  it('returns 400 when username is missing', async () => {
    mockCountDocuments.mockResolvedValue(0);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('username');
  });

  it('returns 400 when username is too short', async () => {
    mockCountDocuments.mockResolvedValue(0);
    const res = await POST(makeRequest({ username: 'ab' }));
    expect(res.status).toBe(400);
  });

  it('returns secret and qrCode when valid', async () => {
    mockCountDocuments.mockResolvedValue(0);
    mockGenerateTOTPSecret.mockReturnValue('TOTP_SECRET');
    mockGenerateQRCode.mockResolvedValue('data:image/png;base64,...');
    const res = await POST(makeRequest({ username: 'admin' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.secret).toBe('TOTP_SECRET');
    expect(json.qrCode).toBe('data:image/png;base64,...');
  });

  it('returns 500 on unexpected error', async () => {
    mockCountDocuments.mockRejectedValue(new Error('db error'));
    const res = await POST(makeRequest({ username: 'admin' }));
    expect(res.status).toBe(500);
  });
});
