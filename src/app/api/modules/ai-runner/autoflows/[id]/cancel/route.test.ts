/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetSession, mockCancelAutoflow, mockLogError } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockCancelAutoflow: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSession: mockGetSession,
}));

vi.mock('@/lib/ai-runner/service', () => ({
  getAIRunnerService: () => ({
    cancelAutoflow: mockCancelAutoflow,
  }),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: mockLogError, debug: vi.fn() }),
}));

import { POST } from './route';

describe('AI runner autoflows [id] cancel route (POST)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createRequest() {
    return {} as NextRequest;
  }

  it('returns unauthorized when no session exists', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await POST(createRequest(), {
      params: Promise.resolve({ id: 'auto-1' }),
    });

    expect(response.status).toBe(401);
    expect(mockCancelAutoflow).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 404 when autoflow is not found', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockCancelAutoflow.mockResolvedValue(null);

    const response = await POST(createRequest(), {
      params: Promise.resolve({ id: 'auto-1' }),
    });

    expect(response.status).toBe(404);
    expect(mockCancelAutoflow).toHaveBeenCalledWith('auto-1');
    expect(await response.json()).toEqual({ error: 'Autoflow not found' });
  });

  it('returns the cancelled autoflow on success', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    const mockAutoflow = { id: 'auto-1', name: 'cancelled name', status: 'cancelled' };
    mockCancelAutoflow.mockResolvedValue(mockAutoflow);

    const response = await POST(createRequest(), {
      params: Promise.resolve({ id: 'auto-1' }),
    });

    expect(response.status).toBe(200);
    expect(mockCancelAutoflow).toHaveBeenCalledWith('auto-1');
    expect(await response.json()).toEqual(mockAutoflow);
  });

  it('logs and returns 400 with error message on service exception', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    const error = new Error('Cancellation failed');
    mockCancelAutoflow.mockRejectedValue(error);

    const response = await POST(createRequest(), {
      params: Promise.resolve({ id: 'auto-1' }),
    });

    expect(response.status).toBe(400);
    expect(mockLogError).toHaveBeenCalledWith('Failed to cancel AI runner autoflow', error);
    expect(await response.json()).toEqual({ error: 'Cancellation failed' });
  });

  it('logs and returns 400 with generic error string on non-Error throw', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockCancelAutoflow.mockRejectedValue('String error');

    const response = await POST(createRequest(), {
      params: Promise.resolve({ id: 'auto-1' }),
    });

    expect(response.status).toBe(400);
    expect(mockLogError).toHaveBeenCalledWith(
      'Failed to cancel AI runner autoflow',
      'String error'
    );
    expect(await response.json()).toEqual({ error: 'Failed to cancel autoflow' });
  });
});
