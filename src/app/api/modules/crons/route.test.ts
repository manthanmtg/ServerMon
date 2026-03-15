/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSnapshot } = vi.hoisted(() => ({
  mockGetSnapshot: vi.fn(),
}));

vi.mock('@/lib/crons/service', () => ({
  cronsService: { getSnapshot: mockGetSnapshot },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';

describe('GET /api/modules/crons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns crons snapshot on success', async () => {
    const snapshot = { jobs: [{ id: '1', command: 'echo hi', minute: '*/5' }] };
    mockGetSnapshot.mockResolvedValue(snapshot);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.jobs).toHaveLength(1);
  });

  it('returns empty jobs list', async () => {
    mockGetSnapshot.mockResolvedValue({ jobs: [] });
    const res = await GET();
    const json = await res.json();
    expect(json.jobs).toEqual([]);
  });

  it('returns 500 on service error', async () => {
    mockGetSnapshot.mockRejectedValue(new Error('crontab error'));
    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch crons snapshot');
  });
});
