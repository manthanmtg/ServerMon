/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockRunTest, mockGetInstance } = vi.hoisted(() => {
  const mockRunTest = vi.fn();
  const mockInstance = { runTest: mockRunTest };
  const mockGetInstance = vi.fn(() => mockInstance);
  return { mockRunTest, mockGetInstance };
});

vi.mock('@/lib/network/speedtest', () => ({
  SpeedtestService: { getInstance: mockGetInstance },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';

describe('GET /api/modules/network/speedtest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns SSE stream with Content-Type text/event-stream', async () => {
    mockRunTest.mockResolvedValue({
      ping: 10,
      speed: 50,
      isp: 'ISP',
      server: 'S',
      location: 'L',
      jitter: 1,
    });
    const req = new NextRequest('http://localhost/api/modules/network/speedtest');
    const res = await GET(req);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache, no-transform');
  });

  it('sends progress updates via SSE stream', async () => {
    mockRunTest.mockImplementation(async (cb: (p: unknown) => void) => {
      cb({ type: 'ping', progress: 10, ping_ms: 12 });
      cb({ type: 'download', progress: 50, speed: 30 });
      cb({ type: 'result', progress: 100, speed: 50 });
      return { ping: 12, speed: 50, isp: 'ISP', server: 'S', location: 'L', jitter: 1 };
    });
    const req = new NextRequest('http://localhost/api/modules/network/speedtest');
    const res = await GET(req);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let output = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      output += decoder.decode(value);
    }
    expect(output).toContain('data:');
    expect(output).toContain('"type":"ping"');
    expect(output).toContain('"type":"result"');
  });

  it('sends error event when runTest throws', async () => {
    mockRunTest.mockRejectedValue(new Error('speedtest binary not found'));
    const req = new NextRequest('http://localhost/api/modules/network/speedtest');
    const res = await GET(req);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let output = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      output += decoder.decode(value);
    }
    expect(output).toContain('"type":"error"');
    expect(output).toContain('speedtest binary not found');
  });
});
