/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetJob, mockCancelJob, mockLogger } = vi.hoisted(() => ({
  mockGetJob: vi.fn(),
  mockCancelJob: vi.fn(),
  mockLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => mockLogger,
}));

vi.mock('@/modules/self-service/engine/job-manager', () => ({
  getJob: mockGetJob,
  cancelJob: mockCancelJob,
}));

import { GET, DELETE } from './route';

function makeContext(jobId: string) {
  return { params: Promise.resolve({ jobId }) };
}

const mockJob = {
  id: 'job-1',
  templateId: 'template-node',
  templateName: 'Node Template',
  methodId: 'apt',
  status: 'pending',
  steps: [],
  config: { version: '20' },
};

describe('GET /api/modules/self-service/install/[jobId]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with job when found', async () => {
    mockGetJob.mockReturnValue(mockJob);
    const res = await GET(new NextRequest('http://localhost'), makeContext('job-1'));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ job: mockJob });
    expect(mockGetJob).toHaveBeenCalledWith('job-1');
  });

  it('returns 404 when job is not found', async () => {
    mockGetJob.mockReturnValue(undefined);
    const res = await GET(new NextRequest('http://localhost'), makeContext('missing'));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Job not found' });
  });

  it('returns 500 when job lookup throws', async () => {
    mockGetJob.mockImplementation(() => {
      throw new Error('lookup failed');
    });
    const res = await GET(new NextRequest('http://localhost'), makeContext('job-1'));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'Failed to fetch job status' });
  });
});

describe('DELETE /api/modules/self-service/install/[jobId]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 when cancellation succeeds', async () => {
    mockCancelJob.mockReturnValue({ success: true });
    const res = await DELETE(new NextRequest('http://localhost'), makeContext('job-1'));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(mockCancelJob).toHaveBeenCalledWith('job-1');
  });

  it('returns 400 when cancellation fails', async () => {
    mockCancelJob.mockReturnValue({ success: false, error: 'Job not found' });
    const res = await DELETE(new NextRequest('http://localhost'), makeContext('missing'));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Job not found' });
  });

  it('returns 500 when cancellation throws', async () => {
    mockCancelJob.mockImplementation(() => {
      throw new Error('cancel failed');
    });
    const res = await DELETE(new NextRequest('http://localhost'), makeContext('job-1'));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'Failed to cancel job' });
  });
});
