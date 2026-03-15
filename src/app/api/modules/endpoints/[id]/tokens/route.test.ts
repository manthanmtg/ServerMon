/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockListTokens, mockGenerateToken } = vi.hoisted(() => ({
  mockListTokens: vi.fn(),
  mockGenerateToken: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/endpoints/token-service', () => ({
  listTokens: mockListTokens,
  generateToken: mockGenerateToken,
}));

import { GET, POST } from './route';

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/modules/endpoints/[id]/tokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns tokens list', async () => {
    mockListTokens.mockResolvedValue([{ prefix: 'tok_abc', name: 'My Token' }]);
    const res = await GET(new NextRequest('http://localhost'), makeContext('ep-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tokens).toHaveLength(1);
  });

  it('returns empty tokens list', async () => {
    mockListTokens.mockResolvedValue([]);
    const res = await GET(new NextRequest('http://localhost'), makeContext('ep-1'));
    const json = await res.json();
    expect(json.tokens).toEqual([]);
  });

  it('returns 500 on error', async () => {
    mockListTokens.mockRejectedValue(new Error('db error'));
    const res = await GET(new NextRequest('http://localhost'), makeContext('ep-1'));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to list tokens');
  });
});

describe('POST /api/modules/endpoints/[id]/tokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateToken.mockResolvedValue({ rawToken: 'tok_abc_secret', prefix: 'tok_abc' });
  });

  function makeRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('generates token and returns 201', async () => {
    const res = await POST(makeRequest({ name: 'My Token' }), makeContext('ep-1'));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.token).toBe('tok_abc_secret');
    expect(json.prefix).toBe('tok_abc');
    expect(json.name).toBe('My Token');
  });

  it('returns 400 when name is missing', async () => {
    const res = await POST(makeRequest({}), makeContext('ep-1'));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Token name is required');
  });

  it('returns 400 when name is empty string', async () => {
    const res = await POST(makeRequest({ name: '   ' }), makeContext('ep-1'));
    expect(res.status).toBe(400);
  });

  it('passes expiresAt to generateToken when provided', async () => {
    const expiresAt = '2027-01-01T00:00:00Z';
    await POST(makeRequest({ name: 'Expiring Token', expiresAt }), makeContext('ep-1'));
    expect(mockGenerateToken).toHaveBeenCalledWith('ep-1', 'Expiring Token', expect.any(Date));
  });

  it('returns 500 on error', async () => {
    mockGenerateToken.mockRejectedValue(new Error('crypto error'));
    const res = await POST(makeRequest({ name: 'My Token' }), makeContext('ep-1'));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to generate token');
  });
});
