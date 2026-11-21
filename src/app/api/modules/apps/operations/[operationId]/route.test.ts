/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockFindAppOperationById } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFindAppOperationById: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/apps/repositories/operation-repository', () => ({
  findAppOperationById: mockFindAppOperationById,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';

describe('/api/modules/apps/operations/[operationId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires an admin session', async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ operationId: 'op_1' }),
    });

    expect(res.status).toBe(401);
  });

  it('returns 404 when the operation is missing', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockFindAppOperationById.mockResolvedValue(null);

    const res = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ operationId: 'missing' }),
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Operation not found' });
  });

  it('returns operation detail', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockFindAppOperationById.mockResolvedValue({
      id: 'op_1',
      appId: 'app-1',
      type: 'update',
      status: 'queued',
      phase: 'queued',
      createdAt: '2026-07-31T05:00:00.000Z',
    });

    const res = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ operationId: 'op_1' }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: {
        operation: {
          id: 'op_1',
          appId: 'app-1',
          type: 'update',
          status: 'queued',
          phase: 'queued',
          createdAt: '2026-07-31T05:00:00.000Z',
        },
      },
    });
  });
});
