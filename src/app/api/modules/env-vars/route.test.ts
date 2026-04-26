/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockGetSnapshot, mockAddEnvVar, mockDeleteEnvVar } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetSnapshot: vi.fn(),
  mockAddEnvVar: vi.fn(),
  mockDeleteEnvVar: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSession: mockGetSession,
}));

vi.mock('@/lib/env-vars/service', () => ({
  envVarsService: {
    getSnapshot: mockGetSnapshot,
    addEnvVar: mockAddEnvVar,
    deleteEnvVar: mockDeleteEnvVar,
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { DELETE, GET, POST } from './route';

function request(body: unknown) {
  return new Request('http://localhost/api/modules/env-vars', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/modules/env-vars', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
  });

  it('rejects unauthenticated requests', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns a snapshot for admins', async () => {
    mockGetSnapshot.mockResolvedValue({ persistent: [], session: [], guidance: [] });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ persistent: [], session: [], guidance: [] });
  });

  it('adds an environment variable', async () => {
    mockAddEnvVar.mockResolvedValue({ applied: true, message: 'saved' });

    const response = await POST(
      request({ key: 'OPENAI_API_KEY', value: 'sk-test', scope: 'user' })
    );

    expect(response.status).toBe(200);
    expect(mockAddEnvVar).toHaveBeenCalledWith({
      key: 'OPENAI_API_KEY',
      value: 'sk-test',
      scope: 'user',
    });
    expect(await response.json()).toEqual({ applied: true, message: 'saved' });
  });

  it('returns validation errors for invalid keys', async () => {
    const response = await POST(request({ key: 'BAD-NAME', value: 'x', scope: 'user' }));

    expect(response.status).toBe(400);
    expect(mockAddEnvVar).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ error: 'Invalid environment variable name' });
  });

  it('deletes an environment variable', async () => {
    mockDeleteEnvVar.mockResolvedValue({ applied: true, message: 'deleted' });

    const response = await DELETE(request({ key: 'OPENAI_API_KEY', scope: 'user' }));

    expect(response.status).toBe(200);
    expect(mockDeleteEnvVar).toHaveBeenCalledWith({
      key: 'OPENAI_API_KEY',
      scope: 'user',
    });
  });
});
