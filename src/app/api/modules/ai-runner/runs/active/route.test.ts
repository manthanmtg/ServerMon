/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockGetActiveRuns, mockLogError } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetActiveRuns: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSession: mockGetSession,
}));

vi.mock('@/lib/ai-runner/service', () => ({
  getAIRunnerService: () => ({
    getActiveRuns: mockGetActiveRuns,
  }),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: mockLogError,
    debug: vi.fn(),
  }),
}));

import { GET } from './route';

describe('AI runner active runs route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns unauthorized when no session exists', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockGetActiveRuns).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns active runs when session exists', async () => {
    const activeRuns = [
      { id: 'run-1', status: 'running', startedAt: '2026-05-24T12:00:00.000Z' },
      { id: 'run-2', status: 'waiting', startedAt: '2026-05-24T12:01:00.000Z' },
    ];

    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockGetActiveRuns.mockResolvedValue(activeRuns);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mockGetActiveRuns).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual(activeRuns);
  });

  it('returns an empty list when there are no active runs', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockGetActiveRuns.mockResolvedValue([]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mockGetActiveRuns).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual([]);
  });

  it('returns 500 with service error message when listing active runs fails', async () => {
    const error = new Error('service down');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockGetActiveRuns.mockRejectedValue(error);

    const response = await GET();

    expect(response.status).toBe(500);
    expect(mockLogError).toHaveBeenCalledWith('Failed to list active AI runner runs', error);
    expect(await response.json()).toEqual({ error: 'Failed to list active runs' });
  });

  it('returns 500 with generic error when listing active runs fails with unknown error', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockGetActiveRuns.mockRejectedValue('boom');

    const response = await GET();

    expect(response.status).toBe(500);
    expect(mockLogError).toHaveBeenCalledWith('Failed to list active AI runner runs', 'boom');
    expect(await response.json()).toEqual({ error: 'Failed to list active runs' });
  });
});
