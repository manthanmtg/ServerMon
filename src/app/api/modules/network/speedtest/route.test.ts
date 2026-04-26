/** @vitest-environment node */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetNetworkSpeedtestOverview,
  mockRunNetworkSpeedtest,
  mockUpdateNetworkSpeedtestSchedule,
  mockGetSession,
} = vi.hoisted(() => ({
  mockGetNetworkSpeedtestOverview: vi.fn(),
  mockRunNetworkSpeedtest: vi.fn(),
  mockUpdateNetworkSpeedtestSchedule: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock('@/lib/network/speedtest', () => ({
  NETWORK_SPEEDTEST_INTERVALS: ['off', '30m', '1h', '3h', '6h', '24h'],
  getNetworkSpeedtestOverview: mockGetNetworkSpeedtestOverview,
  runNetworkSpeedtest: mockRunNetworkSpeedtest,
  updateNetworkSpeedtestSchedule: mockUpdateNetworkSpeedtestSchedule,
}));

vi.mock('@/lib/session', () => ({
  getSession: mockGetSession,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET, PATCH, POST } from './route';

describe('/api/modules/network/speedtest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
  });

  it('returns speedtest overview', async () => {
    mockGetNetworkSpeedtestOverview.mockResolvedValue({
      running: false,
      settings: { scheduleInterval: 'off', nextRunAt: null },
      history: [],
      latest: null,
    });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.settings.scheduleInterval).toBe('off');
  });

  it('requires authentication for overview', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('runs a manual speedtest', async () => {
    mockRunNetworkSpeedtest.mockResolvedValue({
      id: 'result-1',
      trigger: 'manual',
      status: 'completed',
      downloadMbps: 94.01,
    });

    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.downloadMbps).toBe(94.01);
    expect(mockRunNetworkSpeedtest).toHaveBeenCalledWith('manual');
  });

  it('returns 409 when a speedtest is already running', async () => {
    mockRunNetworkSpeedtest.mockRejectedValue(new Error('Speedtest already running'));

    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toBe('Speedtest already running');
  });

  it('updates schedule interval', async () => {
    mockUpdateNetworkSpeedtestSchedule.mockResolvedValue({
      scheduleInterval: '3h',
      nextRunAt: '2026-04-26T20:00:00.000Z',
    });
    const request = new NextRequest('http://localhost/api/modules/network/speedtest', {
      method: 'PATCH',
      body: JSON.stringify({ scheduleInterval: '3h' }),
    });

    const response = await PATCH(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.scheduleInterval).toBe('3h');
    expect(mockUpdateNetworkSpeedtestSchedule).toHaveBeenCalledWith('3h');
  });

  it('rejects unsupported schedule intervals', async () => {
    const request = new NextRequest('http://localhost/api/modules/network/speedtest', {
      method: 'PATCH',
      body: JSON.stringify({ scheduleInterval: '15m' }),
    });

    const response = await PATCH(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain('scheduleInterval');
  });
});
