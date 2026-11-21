/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockListAppOperationEvents } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockListAppOperationEvents: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/apps/repositories/operation-event-repository', () => ({
  listAppOperationEvents: mockListAppOperationEvents,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';

describe('/api/modules/apps/operations/[operationId]/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires an admin session', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'viewer' } });

    const res = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ operationId: 'op_1' }),
    });

    expect(res.status).toBe(401);
  });

  it('returns ordered events after the requested sequence', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockListAppOperationEvents.mockResolvedValue([
      {
        operationId: 'op_1',
        appId: 'app-1',
        sequence: 2,
        type: 'progress',
        message: 'Running',
        createdAt: '2026-07-31T05:01:00.000Z',
      },
    ]);

    const res = await GET(
      new Request('http://localhost/api/modules/apps/operations/op_1/events?after=1&limit=10'),
      { params: Promise.resolve({ operationId: 'op_1' }) }
    );

    expect(res.status).toBe(200);
    expect(mockListAppOperationEvents).toHaveBeenCalledWith('op_1', {
      afterSequence: 1,
      limit: 10,
    });
    await expect(res.json()).resolves.toEqual({
      data: {
        events: [
          {
            operationId: 'op_1',
            appId: 'app-1',
            sequence: 2,
            type: 'progress',
            message: 'Running',
            createdAt: '2026-07-31T05:01:00.000Z',
          },
        ],
      },
    });
  });
});
