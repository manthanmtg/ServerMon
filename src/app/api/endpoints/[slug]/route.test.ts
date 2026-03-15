/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockFindOne,
  mockFindByIdAndUpdate,
  mockCreate,
  mockExecuteEndpoint,
  mockVerifyTokenBySlug,
} = vi.hoisted(() => ({
  mockFindOne: vi.fn(),
  mockFindByIdAndUpdate: vi.fn(),
  mockCreate: vi.fn(),
  mockExecuteEndpoint: vi.fn(),
  mockVerifyTokenBySlug: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/models/CustomEndpoint', () => ({
  default: {
    findOne: mockFindOne,
    findByIdAndUpdate: mockFindByIdAndUpdate,
  },
}));
vi.mock('@/models/EndpointExecutionLog', () => ({
  default: { create: mockCreate },
}));
vi.mock('@/lib/endpoints/executor', () => ({
  executeEndpoint: mockExecuteEndpoint,
}));
vi.mock('@/lib/endpoints/token-service', () => ({
  verifyTokenBySlug: mockVerifyTokenBySlug,
}));

import { GET, POST } from './route';

function makeContext(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

const mockEndpoint = {
  _id: 'ep-1',
  slug: 'my-endpoint',
  method: 'GET',
  enabled: true,
  auth: 'none',
  responseHeaders: {},
};

const mockResult = {
  statusCode: 200,
  body: 'OK',
  headers: { 'content-type': 'text/plain' },
  stdout: '',
  stderr: '',
  error: undefined,
  duration: 100,
};

describe('GET /api/endpoints/[slug]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue(undefined);
    mockFindByIdAndUpdate.mockResolvedValue(undefined);
  });

  it('returns 404 when endpoint not found', async () => {
    mockFindOne.mockResolvedValue(null);
    const req = new NextRequest('http://localhost/api/endpoints/my-endpoint');
    const res = await GET(req, makeContext('my-endpoint'));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Endpoint not found');
  });

  it('returns 503 when endpoint is disabled', async () => {
    mockFindOne.mockResolvedValue({ ...mockEndpoint, enabled: false });
    const req = new NextRequest('http://localhost/api/endpoints/my-endpoint');
    const res = await GET(req, makeContext('my-endpoint'));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe('Endpoint is disabled');
  });

  it('returns 405 when method does not match', async () => {
    mockFindOne.mockResolvedValue({ ...mockEndpoint, method: 'POST' });
    const req = new NextRequest('http://localhost/api/endpoints/my-endpoint', { method: 'GET' });
    const res = await GET(req, makeContext('my-endpoint'));
    expect(res.status).toBe(405);
    const json = await res.json();
    expect(json.error).toContain('not allowed');
  });

  it('executes endpoint and returns result', async () => {
    mockFindOne.mockResolvedValue(mockEndpoint);
    mockExecuteEndpoint.mockResolvedValue(mockResult);
    const req = new NextRequest('http://localhost/api/endpoints/my-endpoint');
    const res = await GET(req, makeContext('my-endpoint'));
    expect(res.status).toBe(200);
  });

  it('sets custom response headers from endpoint config', async () => {
    mockFindOne.mockResolvedValue({
      ...mockEndpoint,
      responseHeaders: { 'x-custom': 'value' },
    });
    mockExecuteEndpoint.mockResolvedValue({ ...mockResult, headers: {} });
    const req = new NextRequest('http://localhost/api/endpoints/my-endpoint');
    const res = await GET(req, makeContext('my-endpoint'));
    expect(res.headers.get('x-custom')).toBe('value');
  });
});

describe('token authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue(undefined);
    mockFindByIdAndUpdate.mockResolvedValue(undefined);
  });

  it('returns 401 when token auth required but no token provided', async () => {
    mockFindOne.mockResolvedValue({ ...mockEndpoint, auth: 'token' });
    const req = new NextRequest('http://localhost/api/endpoints/my-endpoint');
    const res = await GET(req, makeContext('my-endpoint'));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain('Authentication required');
  });

  it('returns 403 when token is invalid', async () => {
    mockFindOne.mockResolvedValue({ ...mockEndpoint, auth: 'token' });
    mockVerifyTokenBySlug.mockResolvedValue(false);
    const req = new NextRequest('http://localhost/api/endpoints/my-endpoint', {
      headers: { authorization: 'Bearer bad-token' },
    });
    const res = await GET(req, makeContext('my-endpoint'));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Invalid or expired token');
  });

  it('accepts valid Bearer token', async () => {
    mockFindOne.mockResolvedValue({ ...mockEndpoint, auth: 'token' });
    mockVerifyTokenBySlug.mockResolvedValue(true);
    mockExecuteEndpoint.mockResolvedValue(mockResult);
    const req = new NextRequest('http://localhost/api/endpoints/my-endpoint', {
      headers: { authorization: 'Bearer valid-token' },
    });
    const res = await GET(req, makeContext('my-endpoint'));
    expect(res.status).toBe(200);
  });

  it('accepts token via query param', async () => {
    mockFindOne.mockResolvedValue({ ...mockEndpoint, auth: 'token' });
    mockVerifyTokenBySlug.mockResolvedValue(true);
    mockExecuteEndpoint.mockResolvedValue(mockResult);
    const req = new NextRequest('http://localhost/api/endpoints/my-endpoint?token=valid-token');
    const res = await GET(req, makeContext('my-endpoint'));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/endpoints/[slug]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue(undefined);
    mockFindByIdAndUpdate.mockResolvedValue(undefined);
  });

  it('reads body for non-GET requests', async () => {
    mockFindOne.mockResolvedValue({ ...mockEndpoint, method: 'POST' });
    mockExecuteEndpoint.mockResolvedValue(mockResult);
    const req = new NextRequest('http://localhost/api/endpoints/my-endpoint', {
      method: 'POST',
      body: '{"key":"value"}',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req, makeContext('my-endpoint'));
    expect(res.status).toBe(200);
    expect(mockExecuteEndpoint).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: '{"key":"value"}' })
    );
  });

  it('returns 500 on unexpected error', async () => {
    mockFindOne.mockRejectedValue(new Error('db connection failed'));
    const req = new NextRequest('http://localhost/api/endpoints/my-endpoint', {
      method: 'POST',
      body: '',
    });
    const res = await POST(req, makeContext('my-endpoint'));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Internal server error');
  });
});
