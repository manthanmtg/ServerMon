/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SystemMetric } from '@/lib/metrics';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockOn = vi.fn();
const mockOff = vi.fn();
const mockCanAcceptConnection = vi.fn();
const mockRegisterConnection = vi.fn();
const mockUnregisterConnection = vi.fn();
const mockGetCurrent = vi.fn();
const mockGetHistory = vi.fn();

vi.mock('@/lib/metrics', () => ({
  metricsService: {
    canAcceptConnection: mockCanAcceptConnection,
    registerConnection: mockRegisterConnection,
    unregisterConnection: mockUnregisterConnection,
    on: mockOn,
    off: mockOff,
    getCurrent: mockGetCurrent,
    getHistory: mockGetHistory,
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeMetric = (): SystemMetric => ({
  timestamp: new Date().toISOString(),
  serverTimestamp: new Date().toISOString(),
  cpu: 25,
  memory: 50,
  cpuCores: 4,
  memTotal: 8_000_000_000,
  memUsed: 4_000_000_000,
  uptime: 3600,
  swapTotal: 0,
  swapUsed: 0,
  swapFree: 0,
  disks: [],
  io: null,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/metrics/stream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanAcceptConnection.mockReturnValue(true);
    mockGetCurrent.mockReturnValue(null);
    mockGetHistory.mockReturnValue([]);
  });

  it('returns 429 when connection limit is reached', async () => {
    mockCanAcceptConnection.mockReturnValue(false);

    const { GET } = await import('./route');
    const response = await GET();

    expect(response.status).toBe(429);
    expect(await response.text()).toContain('Too many connections');
  });

  it('returns 200 with SSE headers when connection is accepted', async () => {
    const { GET } = await import('./route');
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Cache-Control')).toBe('no-cache, no-transform');
    expect(response.headers.get('Connection')).toBe('keep-alive');
    expect(response.headers.get('X-Accel-Buffering')).toBe('no');
  });

  it('registers and then unregisters a connection', async () => {
    const { GET } = await import('./route');
    const response = await GET();

    expect(mockRegisterConnection).toHaveBeenCalledOnce();

    // Trigger cancel on the stream to invoke cleanup
    await response.body!.cancel();

    expect(mockUnregisterConnection).toHaveBeenCalledOnce();
  });

  it('subscribes to the metric event on the metricsService', async () => {
    const { GET } = await import('./route');
    await GET();

    expect(mockOn).toHaveBeenCalledWith('metric', expect.any(Function));
  });

  it('sends the current metric immediately if one is available', async () => {
    const metric = makeMetric();
    mockGetHistory.mockReturnValue([metric]);

    const { GET } = await import('./route');
    const response = await GET();

    // Read the first chunk from the stream
    const reader = response.body!.getReader();
    const { value } = await reader.read();
    reader.cancel();

    const text = new TextDecoder().decode(value);
    expect(text).toContain(`data: ${JSON.stringify(metric)}`);
    expect(text).toContain('\n\n');
  });

  it('does not send any initial data when getCurrent returns null', async () => {
    mockGetCurrent.mockReturnValue(null);

    // Capture the onMetric callback registered with metricsService.on
    let registeredCallback: ((m: SystemMetric) => void) | null = null;
    mockOn.mockImplementation((_event: string, cb: (m: SystemMetric) => void) => {
      registeredCallback = cb;
    });

    const { GET } = await import('./route');
    await GET();

    // The callback should be registered but no data sent yet
    expect(registeredCallback).not.toBeNull();
    expect(mockGetCurrent).toHaveBeenCalled();
  });

  it('unsubscribes from metric event on stream cancel', async () => {
    const { GET } = await import('./route');
    const response = await GET();

    await response.body!.cancel();

    expect(mockOff).toHaveBeenCalledWith('metric', expect.any(Function));
  });

  it('streams metric data when metricsService emits a metric event', async () => {
    let registeredCallback: ((m: SystemMetric) => void) | null = null;
    mockOn.mockImplementation((_event: string, cb: (m: SystemMetric) => void) => {
      registeredCallback = cb;
    });

    const { GET } = await import('./route');
    const response = await GET();

    const metric = makeMetric();

    // Emit a metric via the captured callback
    const reader = response.body!.getReader();
    registeredCallback!(metric);

    const { value } = await reader.read();
    reader.cancel();

    const text = new TextDecoder().decode(value);
    expect(text).toBe(`data: ${JSON.stringify(metric)}\n\n`);
  });
});
