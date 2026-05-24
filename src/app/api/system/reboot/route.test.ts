/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExec, mockGetSession, mockLogger } = vi.hoisted(() => ({
  mockExec: vi.fn(),
  mockGetSession: vi.fn(),
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => mockLogger,
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));

vi.mock('child_process', () => ({ exec: mockExec }));
vi.mock('util', () => ({
  promisify: (fn: unknown) => fn,
}));

import { POST } from './route';

describe('POST /api/system/reboot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { id: 'admin-id' } });
  });

  it('rejects unauthenticated requests', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('returns success response in development mode', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const res = await POST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('success');
    expect(json.message).toContain('Reboot command issued');
  });

  it('does not call exec in non-production', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    await POST();
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('returns expected message structure', async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('message');
    expect(json).toHaveProperty('status');
  });

  it('returns 200 status code', async () => {
    const res = await POST();
    expect(res.status).toBe(200);
  });

  it('issues reboot command in production environment', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockExec.mockResolvedValue(undefined);

    const res = await POST();
    const json = await res.json();

    expect(mockExec).toHaveBeenCalledTimes(1);
    expect(mockExec).toHaveBeenCalledWith('sudo reboot');
    expect(res.status).toBe(200);
    expect(json.status).toBe('success');
  });

  it('does not execute reboot command when unauthenticated in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockGetSession.mockResolvedValue(null);

    const res = await POST();

    expect(res.status).toBe(401);
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('warns that a reboot was requested before execution simulation/dispatch', async () => {
    await POST();

    expect(mockLogger.warn).toHaveBeenCalledWith('System reboot requested via API');
  });

  it('logs execution failure but still responds success in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockExec.mockRejectedValue(new Error('reboot command failed'));

    const res = await POST();
    await Promise.resolve();

    expect(res.status).toBe(200);
    expect(mockLogger.error).toHaveBeenCalledWith('Failed to execute reboot command: reboot command failed');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('success');
  });

  it('handles getSession failures and returns a server error', async () => {
    mockGetSession.mockRejectedValue(new Error('session backend unavailable'));

    const res = await POST();
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('Failed to issue reboot command');
    expect(json.details).toBe('session backend unavailable');
    expect(mockLogger.error).toHaveBeenCalledWith('Reboot error: session backend unavailable');
  });
});
