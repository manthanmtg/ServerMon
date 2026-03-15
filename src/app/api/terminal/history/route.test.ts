/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockConnectDB, mockFind } = vi.hoisted(() => ({
  mockConnectDB: vi.fn().mockResolvedValue(undefined),
  mockFind: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: mockConnectDB }));
vi.mock('@/models/TerminalHistory', () => ({
  default: { find: mockFind },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';

describe('GET /api/terminal/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns terminal history', async () => {
    const history = [{ sessionId: 'sess-1', createdAt: '2024-01-01' }];
    mockFind.mockReturnValue({
      sort: () => ({ limit: () => ({ lean: () => Promise.resolve(history) }) }),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.history).toHaveLength(1);
  });

  it('returns empty history', async () => {
    mockFind.mockReturnValue({
      sort: () => ({ limit: () => ({ lean: () => Promise.resolve([]) }) }),
    });
    const res = await GET();
    const json = await res.json();
    expect(json.history).toEqual([]);
  });

  it('returns 500 on DB error', async () => {
    mockFind.mockReturnValue({
      sort: () => ({ limit: () => ({ lean: () => Promise.reject(new Error('db error')) }) }),
    });
    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch history');
  });
});
