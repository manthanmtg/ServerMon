/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetSession,
  mockLoadAutoUpdateSettings,
  mockSaveAutoUpdateSettings,
  mockGetAutoUpdateScheduleState,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockLoadAutoUpdateSettings: vi.fn(),
  mockSaveAutoUpdateSettings: vi.fn(),
  mockGetAutoUpdateScheduleState: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/updates/auto-update', () => ({
  loadAutoUpdateSettings: mockLoadAutoUpdateSettings,
  saveAutoUpdateSettings: mockSaveAutoUpdateSettings,
  getAutoUpdateScheduleState: mockGetAutoUpdateScheduleState,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET, PATCH } from './route';

function request(body: unknown): Request {
  return new Request('http://localhost/api/system/update/auto', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/system/update/auto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    mockLoadAutoUpdateSettings.mockResolvedValue({
      enabled: true,
      time: '03:00',
      timezone: 'Asia/Kolkata',
      missedRunGraceMinutes: 120,
      missedRunMaxRetries: 1,
    });
    mockSaveAutoUpdateSettings.mockImplementation(async (patch: unknown) => ({
      enabled: true,
      time: '04:30',
      timezone: 'Asia/Kolkata',
      missedRunGraceMinutes: 120,
      missedRunMaxRetries: 1,
      ...(patch as object),
    }));
    mockGetAutoUpdateScheduleState.mockReturnValue({
      enabled: true,
      nextRunAt: '2026-04-26T21:30:00.000Z',
      localDate: '2026-04-26',
      localTime: '03:00',
      timezone: 'Asia/Kolkata',
    });
  });

  it('rejects unauthenticated GET requests', async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it('returns settings with schedule state', async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.settings).toMatchObject({
      enabled: true,
      time: '03:00',
      timezone: 'Asia/Kolkata',
    });
    expect(json.schedule.nextRunAt).toBe('2026-04-26T21:30:00.000Z');
  });

  it('rejects invalid PATCH payloads', async () => {
    const res = await PATCH(request({ enabled: true, time: '99:99', timezone: '' }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid input');
  });

  it('saves enabled, time, and timezone changes', async () => {
    const res = await PATCH(request({ enabled: false, time: '04:30', timezone: 'UTC' }));

    expect(res.status).toBe(200);
    expect(mockSaveAutoUpdateSettings).toHaveBeenCalledWith({
      enabled: false,
      time: '04:30',
      timezone: 'UTC',
    });
    const json = await res.json();
    expect(json.settings).toMatchObject({ enabled: false, time: '04:30', timezone: 'UTC' });
  });
});
