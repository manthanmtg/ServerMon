/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetServiceLogs } = vi.hoisted(() => ({
  mockGetServiceLogs: vi.fn(),
}));

vi.mock('@/lib/services/service', () => ({
  servicesService: { getServiceLogs: mockGetServiceLogs },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';

function makeContext(serviceName: string) {
  return { params: Promise.resolve({ serviceName }) };
}

function makeRequest(params?: Record<string, string>): Request {
  const url = new URL('http://localhost/api/modules/services/nginx/logs');
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  return new Request(url.toString());
}

describe('GET /api/modules/services/[serviceName]/logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns service logs on success', async () => {
    const logs = ['line1', 'line2', 'line3'];
    mockGetServiceLogs.mockResolvedValue(logs);
    const res = await GET(makeRequest(), makeContext('nginx'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.logs).toEqual(logs);
    expect(mockGetServiceLogs).toHaveBeenCalledWith('nginx', 50);
  });

  it('respects lines param', async () => {
    mockGetServiceLogs.mockResolvedValue([]);
    await GET(makeRequest({ lines: '100' }), makeContext('nginx'));
    expect(mockGetServiceLogs).toHaveBeenCalledWith('nginx', 100);
  });

  it('caps lines at 500', async () => {
    mockGetServiceLogs.mockResolvedValue([]);
    await GET(makeRequest({ lines: '1000' }), makeContext('nginx'));
    expect(mockGetServiceLogs).toHaveBeenCalledWith('nginx', 500);
  });

  it('defaults to 50 lines', async () => {
    mockGetServiceLogs.mockResolvedValue([]);
    await GET(makeRequest(), makeContext('ssh'));
    expect(mockGetServiceLogs).toHaveBeenCalledWith('ssh', 50);
  });

  it('returns 500 on service error', async () => {
    mockGetServiceLogs.mockRejectedValue(new Error('journalctl failed'));
    const res = await GET(makeRequest(), makeContext('nginx'));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch service logs');
  });
});
