/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockMongoose = vi.hoisted(() => ({
  connection: { readyState: 1 }, // 1 = connected
}));

vi.mock('mongoose', () => ({ default: mockMongoose }));

vi.mock('@/lib/metrics', () => ({
  metricsService: {
    getCurrent: vi.fn(),
    getConnectionCount: vi.fn().mockReturnValue(0),
  },
}));

// next/server: provide a lightweight NextResponse.json stub
vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn().mockImplementation((body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    })),
  },
}));

import { GET } from './route';
import { metricsService } from '@/lib/metrics';

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMongoose.connection.readyState = 1;
    vi.mocked(metricsService.getConnectionCount).mockReturnValue(0);
  });

  it('returns 200 with status "ok" when DB is connected and metrics are available', async () => {
    vi.mocked(metricsService.getCurrent).mockReturnValue({
      cpu: 25.5,
      memory: 60.0,
      timestamp: '12:00:00',
      serverTimestamp: new Date().toISOString(),
      cpuCores: 4,
      memTotal: 8000000000,
      memUsed: 4000000000,
      uptime: 3600,
      swapTotal: 0,
      swapUsed: 0,
      swapFree: 0,
      disks: [],
      io: null,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.database).toBe('connected');
    expect(body.metrics).toEqual({ cpu: 25.5, memory: 60.0 });
    expect(typeof body.uptime).toBe('number');
    expect(typeof body.timestamp).toBe('string');
  });

  it('returns 503 with status "degraded" when metrics are not yet available', async () => {
    vi.mocked(metricsService.getCurrent).mockReturnValue(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe('degraded');
    expect(body.metrics).toBeNull();
  });

  it('reports the correct database status when the DB is disconnected', async () => {
    // readyState 0 = disconnected — the route reports 'disconnected' but still
    // returns 200 because disconnected !== error (the healthy check is
    // `dbStatus !== 'error' && latest !== null`).
    mockMongoose.connection.readyState = 0;
    vi.mocked(metricsService.getCurrent).mockReturnValue({
      cpu: 10,
      memory: 30,
      timestamp: '12:00:00',
      serverTimestamp: new Date().toISOString(),
      cpuCores: 4,
      memTotal: 8000000000,
      memUsed: 2000000000,
      uptime: 100,
      swapTotal: 0,
      swapUsed: 0,
      swapFree: 0,
      disks: [],
      io: null,
    });

    const response = await GET();
    const body = await response.json();

    // The health logic is: healthy = dbStatus !== 'error' && latest !== null
    // So disconnected (not error) + has metrics = still 200/ok
    expect(body.database).toBe('disconnected');
  });

  it('returns 503 when the DB read throws an exception', async () => {
    // Simulate an exception reading mongoose.connection.readyState
    Object.defineProperty(mockMongoose.connection, 'readyState', {
      get: () => {
        throw new Error('mongoose not ready');
      },
      configurable: true,
    });
    vi.mocked(metricsService.getCurrent).mockReturnValue(null);

    const response = await GET();
    const body = await response.json();

    // dbStatus = 'error', latest = null → degraded
    expect(response.status).toBe(503);
    expect(body.database).toBe('error');

    // Restore
    Object.defineProperty(mockMongoose.connection, 'readyState', {
      value: 1,
      writable: true,
      configurable: true,
    });
  });

  it('reports the active SSE connection count', async () => {
    vi.mocked(metricsService.getCurrent).mockReturnValue({
      cpu: 5,
      memory: 20,
      timestamp: '12:00:00',
      serverTimestamp: new Date().toISOString(),
      cpuCores: 4,
      memTotal: 8000000000,
      memUsed: 1000000000,
      uptime: 200,
      swapTotal: 0,
      swapUsed: 0,
      swapFree: 0,
      disks: [],
      io: null,
    });
    vi.mocked(metricsService.getConnectionCount).mockReturnValue(3);

    const response = await GET();
    const body = await response.json();

    expect(body.sseConnections).toBe(3);
  });

  it('includes uptime as a non-negative integer', async () => {
    vi.mocked(metricsService.getCurrent).mockReturnValue(null);

    const response = await GET();
    const body = await response.json();

    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(body.uptime)).toBe(true);
  });
});
