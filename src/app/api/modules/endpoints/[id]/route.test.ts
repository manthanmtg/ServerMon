/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockFindById, mockFindByIdAndUpdate, mockFindByIdAndDelete, mockFindOne } = vi.hoisted(
  () => ({
    mockFindById: vi.fn(),
    mockFindByIdAndUpdate: vi.fn(),
    mockFindByIdAndDelete: vi.fn(),
    mockFindOne: vi.fn(),
  })
);

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@/models/CustomEndpoint', async () => {
  const { z } = await import('zod');
  const CustomEndpointZodSchema = z.object({
    name: z.string().min(1),
    slug: z.string().min(1),
    description: z.string().optional(),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('GET'),
    endpointType: z.enum(['script', 'logic', 'webhook']).default('script'),
    scriptLang: z.string().optional(),
    scriptContent: z.string().optional(),
    logicConfig: z.unknown().optional(),
    webhookConfig: z.unknown().optional(),
    envVars: z.record(z.string(), z.string()).optional(),
    auth: z.unknown().optional(),
    tags: z.array(z.string()).optional(),
    enabled: z.boolean().default(true),
    timeout: z.number().optional(),
    responseHeaders: z.record(z.string(), z.string()).optional(),
  });

  return {
    default: {
      findById: mockFindById,
      findByIdAndUpdate: mockFindByIdAndUpdate,
      findByIdAndDelete: mockFindByIdAndDelete,
      findOne: mockFindOne,
    },
    CustomEndpointZodSchema,
  };
});

import { GET, PUT, DELETE } from './route';

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

const mockEndpoint = {
  _id: 'ep-1',
  name: 'My Endpoint',
  slug: 'my-endpoint',
  method: 'GET',
  endpointType: 'script',
  enabled: true,
  tags: [],
  envVars: {},
  responseHeaders: {},
};

describe('GET /api/modules/endpoints/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns endpoint on success', async () => {
    mockFindById.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(mockEndpoint),
    });
    const res = await GET(new NextRequest('http://localhost'), makeContext('ep-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe('My Endpoint');
  });

  it('returns 404 when not found', async () => {
    mockFindById.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null),
    });
    const res = await GET(new NextRequest('http://localhost'), makeContext('ep-1'));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Endpoint not found');
  });

  it('returns 500 on db error', async () => {
    mockFindById.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockRejectedValue(new Error('db error')),
    });
    const res = await GET(new NextRequest('http://localhost'), makeContext('ep-1'));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch endpoint');
  });
});

describe('PUT /api/modules/endpoints/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindOne.mockResolvedValue(null);
  });

  function makeRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('returns 404 when endpoint not found', async () => {
    mockFindById.mockResolvedValue(null);
    const res = await PUT(makeRequest({ name: 'Updated' }), makeContext('ep-1'));
    expect(res.status).toBe(404);
  });

  it('updates endpoint successfully', async () => {
    mockFindById.mockResolvedValue({
      ...mockEndpoint,
      envVars: new Map(),
      responseHeaders: new Map(),
    });
    mockFindByIdAndUpdate.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ ...mockEndpoint, name: 'Updated' }),
    });

    const res = await PUT(
      makeRequest({ name: 'Updated', slug: 'my-endpoint', method: 'GET', endpointType: 'script' }),
      makeContext('ep-1')
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe('Updated');
  });

  it('returns 409 on slug conflict', async () => {
    mockFindById.mockResolvedValue({
      ...mockEndpoint,
      envVars: new Map(),
      responseHeaders: new Map(),
    });
    mockFindOne.mockResolvedValue({ _id: 'other', slug: 'new-slug' });

    const res = await PUT(
      makeRequest({ name: 'My Endpoint', slug: 'new-slug', method: 'GET', endpointType: 'script' }),
      makeContext('ep-1')
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain('already taken');
  });

  it('returns 500 on db error', async () => {
    mockFindById.mockRejectedValue(new Error('db error'));
    const res = await PUT(
      makeRequest({ name: 'x', slug: 'x', method: 'GET', endpointType: 'script' }),
      makeContext('ep-1')
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to update endpoint');
  });
});

describe('DELETE /api/modules/endpoints/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes endpoint and returns success', async () => {
    mockFindByIdAndDelete.mockResolvedValue({ ...mockEndpoint });
    const res = await DELETE(new NextRequest('http://localhost'), makeContext('ep-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('returns 404 when not found', async () => {
    mockFindByIdAndDelete.mockResolvedValue(null);
    const res = await DELETE(new NextRequest('http://localhost'), makeContext('ep-1'));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Endpoint not found');
  });

  it('returns 500 on db error', async () => {
    mockFindByIdAndDelete.mockRejectedValue(new Error('db error'));
    const res = await DELETE(new NextRequest('http://localhost'), makeContext('ep-1'));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to delete endpoint');
  });
});
