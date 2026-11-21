/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockFindAppOperationById, mockReleaseAppOperationLock } = vi.hoisted(
  () => ({
    mockGetSession: vi.fn(),
    mockFindAppOperationById: vi.fn(),
    mockReleaseAppOperationLock: vi.fn(),
  })
);

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/apps/repositories/operation-repository', () => ({
  findAppOperationById: mockFindAppOperationById,
  releaseAppOperationLock: mockReleaseAppOperationLock,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { POST } from './route';

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/modules/apps/operations/op_1/release-lock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/modules/apps/operations/[operationId]/release-lock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindAppOperationById.mockResolvedValue({
      id: 'op_1',
      appId: 'app-1',
      status: 'failed',
      phase: 'terminal',
      createdAt: '2026-07-31T05:00:00.000Z',
    });
    mockReleaseAppOperationLock.mockResolvedValue({
      id: 'op_1',
      appId: 'app-1',
      status: 'failed',
      phase: 'terminal',
      createdAt: '2026-07-31T05:00:00.000Z',
      errorCode: 'WORKER_INTERRUPTED',
    });
  });

  it('requires an admin session', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'viewer' } });

    const res = await POST(makeRequest({ confirm: true }), {
      params: Promise.resolve({ operationId: 'op_1' }),
    });

    expect(res.status).toBe(401);
    expect(mockReleaseAppOperationLock).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin', username: 'admin' } });

    const res = await POST(makeRequest({ confirm: false }), {
      params: Promise.resolve({ operationId: 'op_1' }),
    });

    expect(res.status).toBe(400);
    expect(mockReleaseAppOperationLock).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown operations', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin', username: 'admin' } });
    mockFindAppOperationById.mockResolvedValue(null);

    const res = await POST(makeRequest({ confirm: true }), {
      params: Promise.resolve({ operationId: 'missing' }),
    });

    expect(res.status).toBe(404);
  });

  it('returns 409 when the operation lock is not recovery-required', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin', username: 'admin' } });
    mockReleaseAppOperationLock.mockResolvedValue(null);

    const res = await POST(makeRequest({ confirm: true }), {
      params: Promise.resolve({ operationId: 'op_1' }),
    });

    expect(res.status).toBe(409);
  });

  it('releases the lock and returns the operation', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin', username: 'admin' } });

    const res = await POST(makeRequest({ confirm: true }), {
      params: Promise.resolve({ operationId: 'op_1' }),
    });

    expect(res.status).toBe(200);
    expect(mockReleaseAppOperationLock).toHaveBeenCalledWith({
      operationId: 'op_1',
      reason: expect.stringContaining('admin'),
      releasedBy: 'admin',
    });
    await expect(res.json()).resolves.toMatchObject({
      data: { operation: { id: 'op_1', errorCode: 'WORKER_INTERRUPTED' } },
    });
  });
});
