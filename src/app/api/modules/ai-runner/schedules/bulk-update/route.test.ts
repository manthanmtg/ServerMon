/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockBulkUpdateSchedules } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockBulkUpdateSchedules: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSession: mockGetSession,
}));

vi.mock('@/lib/ai-runner/service', () => ({
  getAIRunnerService: () => ({
    bulkUpdateSchedules: mockBulkUpdateSchedules,
  }),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { POST } from './route';

function request(body: unknown) {
  return new Request('http://localhost/api/modules/ai-runner/schedules/bulk-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

describe('AI runner schedule bulk update route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns unauthorized when no session exists', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await POST(request({ updates: [] }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('updates schedules for authenticated users', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockBulkUpdateSchedules.mockResolvedValue({
      schedules: [{ _id: 'schedule-1' }],
      updatedCount: 1,
    });

    const response = await POST(
      request({
        updates: [
          {
            id: 'schedule-1',
            cronExpression: '0 2 * * *',
            timeout: 45,
            retries: 1,
          },
        ],
      })
    );

    expect(response.status).toBe(200);
    expect(mockBulkUpdateSchedules).toHaveBeenCalledWith([
      {
        id: 'schedule-1',
        cronExpression: '0 2 * * *',
        timeout: 45,
        retries: 1,
      },
    ]);
    expect(await response.json()).toEqual({ schedules: [{ _id: 'schedule-1' }], updatedCount: 1 });
  });

  it('returns row errors when bulk validation fails', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockBulkUpdateSchedules.mockRejectedValue({
      rowErrors: [
        {
          id: 'schedule-1',
          field: 'cronExpression',
          message: 'Invalid cron expression',
        },
      ],
    });

    const response = await POST(
      request({
        updates: [
          {
            id: 'schedule-1',
            cronExpression: 'bad cron',
            timeout: 45,
            retries: 1,
          },
        ],
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Bulk schedule update failed validation',
      rowErrors: [
        {
          id: 'schedule-1',
          field: 'cronExpression',
          message: 'Invalid cron expression',
        },
      ],
    });
  });
});
