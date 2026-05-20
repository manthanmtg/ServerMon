/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetSession, mockUpdateAutoflow, mockLogError } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockUpdateAutoflow: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSession: mockGetSession,
}));

vi.mock('@/lib/ai-runner/service', () => ({
  getAIRunnerService: () => ({
    updateAutoflow: mockUpdateAutoflow,
  }),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: mockLogError, debug: vi.fn() }),
}));

import { PUT } from './route';

describe('AI runner autoflows [id] route (PUT)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createRequest(body: unknown) {
    return {
      json: vi.fn().mockResolvedValue(body),
    } as unknown as NextRequest;
  }

  it('returns unauthorized when no session exists', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await PUT(createRequest({ name: 'updated' }), {
      params: Promise.resolve({ id: 'auto-1' }),
    });

    expect(response.status).toBe(401);
    expect(mockUpdateAutoflow).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 for invalid body schema', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });

    // name must be string, not number
    const response = await PUT(createRequest({ name: 123 }), {
      params: Promise.resolve({ id: 'auto-1' }),
    });

    expect(response.status).toBe(400);
    expect(mockUpdateAutoflow).not.toHaveBeenCalled();
    const data = await response.json();
    expect(data.error).toContain('expected string, received number');
  });

  it('returns 404 when autoflow is not found', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockUpdateAutoflow.mockResolvedValue(null);

    const response = await PUT(createRequest({ name: 'updated name' }), {
      params: Promise.resolve({ id: 'auto-1' }),
    });

    expect(response.status).toBe(404);
    expect(mockUpdateAutoflow).toHaveBeenCalledWith(
      'auto-1',
      expect.objectContaining({ name: 'updated name' })
    );
    expect(await response.json()).toEqual({ error: 'Autoflow not found' });
  });

  it('returns the updated autoflow on success', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    const mockAutoflow = { id: 'auto-1', name: 'updated name', mode: 'sequential' };
    mockUpdateAutoflow.mockResolvedValue(mockAutoflow);

    const response = await PUT(createRequest({ name: 'updated name' }), {
      params: Promise.resolve({ id: 'auto-1' }),
    });

    expect(response.status).toBe(200);
    expect(mockUpdateAutoflow).toHaveBeenCalledWith(
      'auto-1',
      expect.objectContaining({ name: 'updated name' })
    );
    expect(await response.json()).toEqual(mockAutoflow);
  });

  it('logs and returns 400 with generic error message on service exception', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    const error = new Error('Database connection failed');
    mockUpdateAutoflow.mockRejectedValue(error);

    const response = await PUT(createRequest({ name: 'updated' }), {
      params: Promise.resolve({ id: 'auto-1' }),
    });

    expect(response.status).toBe(400);
    expect(mockLogError).toHaveBeenCalledWith('Failed to update AI runner autoflow', error);
    expect(await response.json()).toEqual({ error: 'Database connection failed' });
  });

  it('logs and returns 400 with generic error string on non-Error throw', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockUpdateAutoflow.mockRejectedValue('String error');

    const response = await PUT(createRequest({ name: 'updated' }), {
      params: Promise.resolve({ id: 'auto-1' }),
    });

    expect(response.status).toBe(400);
    expect(mockLogError).toHaveBeenCalledWith(
      'Failed to update AI runner autoflow',
      'String error'
    );
    expect(await response.json()).toEqual({ error: 'Failed to update autoflow' });
  });
});
