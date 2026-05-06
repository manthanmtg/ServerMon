/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const { mockGetAllJobs, mockLogError } = vi.hoisted(() => ({
  mockGetAllJobs: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock('@/modules/self-service/engine/job-manager', () => ({
  getAllJobs: mockGetAllJobs,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: mockLogError, debug: vi.fn() }),
}));

describe('GET /api/modules/self-service/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all jobs when successful', async () => {
    const mockJobs = [
      { id: 'job-1', status: 'completed' },
      { id: 'job-2', status: 'failed' },
    ];
    mockGetAllJobs.mockReturnValue(mockJobs);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mockGetAllJobs).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({
      jobs: mockJobs,
      total: 2,
    });
  });

  it('logs and returns 500 when job retrieval fails', async () => {
    const error = new Error('database failure');
    mockGetAllJobs.mockImplementation(() => {
      throw error;
    });

    const response = await GET();

    expect(response.status).toBe(500);
    expect(mockLogError).toHaveBeenCalledWith('Failed to fetch install history', error);
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to fetch install history',
    });
  });
});
