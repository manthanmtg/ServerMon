/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockListUpdateRuns } = vi.hoisted(() => ({
  mockListUpdateRuns: vi.fn(),
}));

vi.mock('@/lib/updates/system-service', () => ({
  systemUpdateService: { listUpdateRuns: mockListUpdateRuns },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';

describe('GET /api/system/update/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns update history list', async () => {
    const history = [
      { id: 'run-1', status: 'completed', startedAt: '2024-01-01' },
      { id: 'run-2', status: 'failed', startedAt: '2024-01-02' },
    ];
    mockListUpdateRuns.mockResolvedValue(history);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);
  });

  it('returns empty array when no history', async () => {
    mockListUpdateRuns.mockResolvedValue([]);
    const res = await GET();
    const json = await res.json();
    expect(json).toEqual([]);
  });

  it('returns 500 on service error', async () => {
    mockListUpdateRuns.mockRejectedValue(new Error('db error'));
    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to list update history');
  });
});
