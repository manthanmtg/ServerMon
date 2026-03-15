/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockFindOne, mockCreate } = vi.hoisted(() => ({
  mockFindOne: vi.fn(),
  mockCreate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// We need to mock the Zod schema too. The safeParse method validates input.
// Easiest: mock the whole model module including the schema.
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
      findOne: mockFindOne,
      create: mockCreate,
    },
    CustomEndpointZodSchema,
  };
});

import { POST } from './route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/modules/endpoints/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/modules/endpoints/create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindOne.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      _id: 'ep-1',
      name: 'My Endpoint',
      slug: 'my-endpoint',
      toObject: () => ({ _id: 'ep-1', name: 'My Endpoint', slug: 'my-endpoint' }),
    });
  });

  const validBody = {
    name: 'My Endpoint',
    slug: 'my-endpoint',
    method: 'GET',
    endpointType: 'script',
  };

  it('creates endpoint and returns 201', async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.name).toBe('My Endpoint');
  });

  it('auto-generates slug from name if not provided', async () => {
    await POST(makeRequest({ name: 'My New Endpoint', method: 'GET', endpointType: 'script' }));
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ slug: 'my-new-endpoint' }));
  });

  it('returns 400 on validation failure (missing name)', async () => {
    const res = await POST(makeRequest({ slug: 'no-name', method: 'GET', endpointType: 'script' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
  });

  it('returns 409 when slug already exists', async () => {
    mockFindOne.mockResolvedValue({ _id: 'existing', slug: 'my-endpoint' });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain('already exists');
  });

  it('returns 500 on db error', async () => {
    mockCreate.mockRejectedValue(new Error('db error'));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to create endpoint');
  });
});
