/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreateJob } = vi.hoisted(() => ({
  mockCreateJob: vi.fn(),
}));

vi.mock('@/lib/crons/service', () => ({
  cronsService: { createJob: mockCreateJob },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { POST } from './route';
import { NextRequest } from 'next/server';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/modules/crons/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validJob = {
  minute: '*/5',
  hour: '*',
  dayOfMonth: '*',
  month: '*',
  dayOfWeek: '*',
  command: 'echo hello',
};

describe('POST /api/modules/crons/create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a cron job successfully', async () => {
    mockCreateJob.mockResolvedValue({ success: true, id: 'job-1' });
    const res = await POST(makeRequest(validJob));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('passes all fields to service', async () => {
    mockCreateJob.mockResolvedValue({ success: true });
    const jobWithMeta = { ...validJob, comment: 'Test job', user: 'root' };
    await POST(makeRequest(jobWithMeta));
    expect(mockCreateJob).toHaveBeenCalledWith(
      expect.objectContaining({
        minute: '*/5',
        command: 'echo hello',
        comment: 'Test job',
        user: 'root',
      })
    );
  });

  it('returns 400 for missing minute', async () => {
    const { minute: _m, ...partial } = validJob;
    const res = await POST(makeRequest(partial));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('minute');
  });

  it('returns 400 for missing command', async () => {
    const { command: _c, ...partial } = validJob;
    const res = await POST(makeRequest(partial));
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing hour', async () => {
    const { hour: _h, ...partial } = validJob;
    const res = await POST(makeRequest(partial));
    expect(res.status).toBe(400);
  });

  it('returns 500 when service creation fails', async () => {
    mockCreateJob.mockResolvedValue({ success: false, message: 'Write failed' });
    const res = await POST(makeRequest(validJob));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Write failed');
  });

  it('returns 500 on service throw', async () => {
    mockCreateJob.mockRejectedValue(new Error('unexpected'));
    const res = await POST(makeRequest(validJob));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to create cron job');
  });
});
