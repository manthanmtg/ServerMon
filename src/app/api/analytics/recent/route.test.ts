/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/analytics', () => ({
  analyticsService: {
    getRecentEvents: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn().mockImplementation((body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    })),
  },
}));

import { GET } from './route';
import { analyticsService } from '@/lib/analytics';

const makeRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/analytics/recent');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
};

describe('GET /api/analytics/recent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns events from the analytics service', async () => {
    const mockEvents = [{ moduleId: 'auth', event: 'login', timestamp: new Date().toISOString() }];
    vi.mocked(analyticsService.getRecentEvents).mockResolvedValue(mockEvents as never);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.events).toEqual(mockEvents);
  });

  it('defaults to limit 50 when no limit param is given', async () => {
    vi.mocked(analyticsService.getRecentEvents).mockResolvedValue([]);

    await GET(makeRequest());

    expect(analyticsService.getRecentEvents).toHaveBeenCalledWith(50);
  });

  it('passes a custom limit to the service', async () => {
    vi.mocked(analyticsService.getRecentEvents).mockResolvedValue([]);

    await GET(makeRequest({ limit: '25' }));

    expect(analyticsService.getRecentEvents).toHaveBeenCalledWith(25);
  });

  it('caps the limit at 500', async () => {
    vi.mocked(analyticsService.getRecentEvents).mockResolvedValue([]);

    await GET(makeRequest({ limit: '9999' }));

    expect(analyticsService.getRecentEvents).toHaveBeenCalledWith(500);
  });

  it('returns 500 when the analytics service throws', async () => {
    vi.mocked(analyticsService.getRecentEvents).mockRejectedValue(new Error('DB unavailable'));

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBeDefined();
  });

  it('returns an empty events array when the service returns nothing', async () => {
    vi.mocked(analyticsService.getRecentEvents).mockResolvedValue([]);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.events).toEqual([]);
  });
});
