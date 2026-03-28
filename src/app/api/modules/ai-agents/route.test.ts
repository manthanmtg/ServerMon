/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSnapshot } = vi.hoisted(() => ({
  mockGetSnapshot: vi.fn(),
}));

vi.mock('@/lib/ai-agents/service', () => ({
  getAIAgentsService: () => ({ getSnapshot: mockGetSnapshot }),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';

describe('GET /api/modules/ai-agents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns snapshot on success', async () => {
    const snapshot = {
      summary: { total: 2, running: 1, idle: 1, waiting: 0, error: 0, completed: 0 },
      sessions: [{ id: 'session-1', status: 'running' }],
      pastSessions: [{ id: 'session-2', status: 'completed' }],
      timestamp: '2024-01-01T00:00:00Z',
    };
    mockGetSnapshot.mockResolvedValue(snapshot);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sessions).toHaveLength(1);
    expect(json.summary.total).toBe(2);
  });

  it('returns empty snapshot when no sessions', async () => {
    const snapshot = {
      summary: { total: 0, running: 0, idle: 0, waiting: 0, error: 0, completed: 0 },
      sessions: [],
      pastSessions: [],
      timestamp: '2024-01-01T00:00:00Z',
    };
    mockGetSnapshot.mockResolvedValue(snapshot);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sessions).toHaveLength(0);
  });

  it('returns 500 on service error', async () => {
    mockGetSnapshot.mockRejectedValue(new Error('scan failed'));
    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch AI agents snapshot');
  });
});
