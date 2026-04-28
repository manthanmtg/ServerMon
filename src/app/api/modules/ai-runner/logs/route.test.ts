/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockReadAIRunnerLogEntries, mockLogError } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockReadAIRunnerLogEntries: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSession: mockGetSession,
}));

vi.mock('@/lib/ai-runner/logs', () => ({
  readAIRunnerLogEntries: mockReadAIRunnerLogEntries,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: mockLogError, debug: vi.fn() }),
}));

import { GET } from './route';

function request(limit?: string) {
  const url = new URL('http://localhost/api/modules/ai-runner/logs');
  if (limit !== undefined) {
    url.searchParams.set('limit', limit);
  }
  return new Request(url) as never;
}

describe('AI runner logs route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns unauthorized when no session exists', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mockReadAIRunnerLogEntries).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('uses the default log limit when no limit is provided', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockReadAIRunnerLogEntries.mockResolvedValue({ entries: [] });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mockReadAIRunnerLogEntries).toHaveBeenCalledWith(200);
    expect(await response.json()).toEqual({ entries: [] });
  });

  it('passes a valid requested limit to the log reader', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockReadAIRunnerLogEntries.mockResolvedValue({ entries: [{ message: 'started' }] });

    const response = await GET(request('25'));

    expect(response.status).toBe(200);
    expect(mockReadAIRunnerLogEntries).toHaveBeenCalledWith(25);
    expect(await response.json()).toEqual({ entries: [{ message: 'started' }] });
  });

  it('clamps low and invalid limits to the supported range', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockReadAIRunnerLogEntries.mockResolvedValue({ entries: [] });

    await GET(request('0'));
    await GET(request('-4'));
    await GET(request('not-a-number'));

    expect(mockReadAIRunnerLogEntries).toHaveBeenNthCalledWith(1, 200);
    expect(mockReadAIRunnerLogEntries).toHaveBeenNthCalledWith(2, 1);
    expect(mockReadAIRunnerLogEntries).toHaveBeenNthCalledWith(3, 200);
  });

  it('clamps large limits to the maximum supported value', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockReadAIRunnerLogEntries.mockResolvedValue({ entries: [] });

    const response = await GET(request('5000'));

    expect(response.status).toBe(200);
    expect(mockReadAIRunnerLogEntries).toHaveBeenCalledWith(1000);
  });

  it('logs and returns a generic error when the log reader fails', async () => {
    const error = new Error('disk unavailable');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockReadAIRunnerLogEntries.mockRejectedValue(error);

    const response = await GET(request('50'));

    expect(response.status).toBe(500);
    expect(mockLogError).toHaveBeenCalledWith('Failed to list AI Runner logs', error);
    expect(await response.json()).toEqual({ error: 'Failed to list AI Runner logs' });
  });
});
