/** @vitest-environment node */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockCreateJob, mockLogger } = vi.hoisted(() => ({
  mockCreateJob: vi.fn(),
  mockLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => mockLogger,
}));

vi.mock('@/modules/self-service/engine/job-manager', () => ({
  createJob: mockCreateJob,
}));

import { POST } from './route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/modules/self-service/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/modules/self-service/install', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when templateId is missing', async () => {
    const req = makeRequest({ methodId: 'apt', config: {} });
    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Missing required fields: templateId, methodId, config',
    });
    expect(mockCreateJob).not.toHaveBeenCalled();
  });

  it('returns 400 when methodId is missing', async () => {
    const req = makeRequest({ templateId: 'node', config: {} });
    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Missing required fields: templateId, methodId, config',
    });
    expect(mockCreateJob).not.toHaveBeenCalled();
  });

  it('returns 400 when config is missing', async () => {
    const req = makeRequest({ templateId: 'node', methodId: 'apt' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Missing required fields: templateId, methodId, config',
    });
    expect(mockCreateJob).not.toHaveBeenCalled();
  });

  it('returns 400 when createJob reports validation error', async () => {
    mockCreateJob.mockReturnValue({ error: 'Template not found: missing-template' });

    const req = makeRequest({
      templateId: 'missing-template',
      methodId: 'apt',
      config: { version: 'latest' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Template not found: missing-template',
    });
  });

  it('returns 201 with created job on success', async () => {
    mockCreateJob.mockReturnValue({
      id: 'job-1',
      templateId: 'node',
      templateName: 'Node Runtime',
      methodId: 'apt',
      config: { version: '20' },
      status: 'pending',
      steps: [],
    });

    const req = makeRequest({ templateId: 'node', methodId: 'apt', config: { version: '20' } });
    const res = await POST(req);
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json).toEqual({
      job: {
        id: 'job-1',
        templateId: 'node',
        templateName: 'Node Runtime',
        methodId: 'apt',
        config: { version: '20' },
        status: 'pending',
        steps: [],
      },
    });
    expect(mockCreateJob).toHaveBeenCalledWith({
      templateId: 'node',
      methodId: 'apt',
      config: { version: '20' },
    });
  });

  it('returns 500 when JSON body cannot be parsed', async () => {
    const req = new NextRequest('http://localhost/api/modules/self-service/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid-json}',
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: 'Failed to create install job',
    });
  });
});
