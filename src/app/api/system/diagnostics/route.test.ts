/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockGetSnapshot } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetSnapshot: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSession: mockGetSession,
}));

vi.mock('@/lib/runtime-diagnostics', () => ({
  getRuntimeDiagnostics: () => ({
    getSnapshot: mockGetSnapshot,
  }),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';

describe('GET /api/system/diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns unauthorized when no session exists', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns a diagnostics snapshot for authenticated users', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockGetSnapshot.mockReturnValue({
      generatedAt: '2026-04-21T18:00:00.000Z',
      process: { pid: 1234 },
      eventLoop: { utilization: 0.25 },
      requests: { inFlightCount: 1 },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      generatedAt: '2026-04-21T18:00:00.000Z',
      process: { pid: 1234 },
      eventLoop: { utilization: 0.25 },
      requests: { inFlightCount: 1 },
    });
  });
});
