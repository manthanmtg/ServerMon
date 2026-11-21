/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetSession, mockLogger, mockRollbackJob } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  mockRollbackJob: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => mockLogger,
}));

vi.mock('@/lib/session', () => ({
  getSession: mockGetSession,
}));

vi.mock('@/modules/self-service/engine/job-manager', () => ({
  rollbackJob: mockRollbackJob,
}));

import { POST } from './route';

describe('POST /api/modules/self-service/install/[jobId]/rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
  });

  it('rejects unauthenticated requests before rolling back a job', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await POST(new NextRequest('http://localhost'), {
      params: Promise.resolve({ jobId: 'job-1' }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockRollbackJob).not.toHaveBeenCalled();
  });
});
