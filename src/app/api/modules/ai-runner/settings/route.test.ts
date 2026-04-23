/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockGetSettings, mockUpdateSettings } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetSettings: vi.fn(),
  mockUpdateSettings: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSession: mockGetSession,
}));

vi.mock('@/lib/ai-runner/service', () => ({
  getAIRunnerService: () => ({
    getSettings: mockGetSettings,
    updateSettings: mockUpdateSettings,
  }),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET, PATCH } from './route';

describe('AI runner settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns unauthorized when no session exists', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns settings for authenticated users', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockGetSettings.mockResolvedValue({ schedulesGloballyEnabled: true });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ schedulesGloballyEnabled: true });
  });

  it('updates settings for authenticated users', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockUpdateSettings.mockResolvedValue({ schedulesGloballyEnabled: false });

    const response = await PATCH(
      new Request('http://localhost/api/modules/ai-runner/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedulesGloballyEnabled: false }),
      }) as never
    );

    expect(response.status).toBe(200);
    expect(mockUpdateSettings).toHaveBeenCalledWith({ schedulesGloballyEnabled: false });
    expect(await response.json()).toEqual({ schedulesGloballyEnabled: false });
  });
});
