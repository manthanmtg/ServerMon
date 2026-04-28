/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockListKnownDirectories, mockLogError } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockListKnownDirectories: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSession: mockGetSession,
}));

vi.mock('@/lib/ai-runner/service', () => ({
  getAIRunnerService: () => ({
    listKnownDirectories: mockListKnownDirectories,
  }),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: mockLogError, debug: vi.fn() }),
}));

import { GET } from './route';

describe('AI runner directories route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns unauthorized when no session exists', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockListKnownDirectories).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns known directories for authenticated users', async () => {
    const directories = [
      { path: '/srv/servermon', label: 'ServerMon root', exists: true },
      { path: '/tmp/servermon-runs', label: 'Run artifacts', exists: false },
    ];
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockListKnownDirectories.mockResolvedValue(directories);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mockListKnownDirectories).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual(directories);
  });

  it('returns an empty directory list without treating it as an error', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockListKnownDirectories.mockResolvedValue([]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('creates a fresh service facade for each request', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockListKnownDirectories.mockResolvedValue([{ path: '/srv/app', exists: true }]);

    await GET();
    await GET();

    expect(mockListKnownDirectories).toHaveBeenCalledTimes(2);
  });

  it('logs and returns a generic error when listing directories fails', async () => {
    const error = new Error('filesystem unavailable');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockListKnownDirectories.mockRejectedValue(error);

    const response = await GET();

    expect(response.status).toBe(500);
    expect(mockLogError).toHaveBeenCalledWith('Failed to list AI runner directories', error);
    expect(await response.json()).toEqual({ error: 'Failed to list directories' });
  });
});
