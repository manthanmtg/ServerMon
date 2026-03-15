/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { mockExec } = vi.hoisted(() => ({
  mockExec: vi.fn(),
}));

vi.mock('child_process', () => ({ exec: mockExec }));
vi.mock('util', () => ({
  promisify: (fn: unknown) => fn,
}));

import { POST } from './route';

describe('POST /api/system/reboot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
