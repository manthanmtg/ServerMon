/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockFindById, mockFindByIdAndUpdate, mockCreate, mockExecuteEndpoint } = vi.hoisted(() => ({
  mockFindById: vi.fn(),
  mockFindByIdAndUpdate: vi.fn(),
  mockCreate: vi.fn(),
  mockExecuteEndpoint: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/models/CustomEndpoint', () => ({
  default: {
    findById: mockFindById,
    findByIdAndUpdate: mockFindByIdAndUpdate,
  },
}));
vi.mock('@/models/EndpointExecutionLog', () => ({
  default: { create: mockCreate },
}));
vi.mock('@/lib/endpoints/executor', () => ({
  executeEndpoint: mockExecuteEndpoint,
}));

import { POST } from './route';

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(body: unknown = {}): NextRequest {
  return new NextRequest('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const mockEndpoint = {
  _id: 'ep-1',
  name: 'My Endpoint',
  slug: 'my-endpoint',
  method: 'POST',
  endpointType: 'script',
};

describe('POST /api/modules/endpoints/[id]/test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({});
    mockFindByIdAndUpdate.mockResolvedValue({});
    mockExecuteEndpoint.mockResolvedValue({
      statusCode: 200,
      duration: 50,
      body: '{"ok":true}',
      stdout: 'output',
      stderr: '',
      error: null,
    });
  });

  it('returns execution result on success', async () => {
    mockFindById.mockResolvedValue(mockEndpoint);
    const res = await POST(
      makeRequest({ body: 'test', headers: {}, queryParams: {} }),
      makeContext('ep-1')
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.statusCode).toBe(200);
  });

  it('returns 404 when endpoint not found', async () => {
    mockFindById.mockResolvedValue(null);
    const res = await POST(makeRequest(), makeContext('ep-1'));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Endpoint not found');
  });

  it('logs execution to db', async () => {
    mockFindById.mockResolvedValue(mockEndpoint);
    await POST(makeRequest(), makeContext('ep-1'));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointId: 'ep-1',
        triggeredBy: 'test',
      })
    );
  });

  it('updates execution count', async () => {
    mockFindById.mockResolvedValue(mockEndpoint);
    await POST(makeRequest(), makeContext('ep-1'));
    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
      'ep-1',
      expect.objectContaining({
        $inc: { executionCount: 1 },
      })
    );
  });

  it('handles empty request body gracefully', async () => {
    mockFindById.mockResolvedValue(mockEndpoint);
    const req = new NextRequest('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'not-json',
    });
    const res = await POST(req, makeContext('ep-1'));
    // Should still work, falling back to empty body
    expect(res.status).toBe(200);
  });

  it('returns 500 on executor error', async () => {
    mockFindById.mockResolvedValue(mockEndpoint);
    mockExecuteEndpoint.mockRejectedValue(new Error('exec failed'));
    const res = await POST(makeRequest(), makeContext('ep-1'));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to test endpoint');
  });
});
