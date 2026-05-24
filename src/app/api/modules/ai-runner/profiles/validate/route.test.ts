/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockValidateProfileTemplate } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockValidateProfileTemplate: vi.fn(),
}));

const { mockGetAIRunnerService } = vi.hoisted(() => ({
  mockGetAIRunnerService: vi.fn(),
}));

mockGetAIRunnerService.mockImplementation(() => ({
  validateProfileTemplate: mockValidateProfileTemplate,
}));

vi.mock('@/lib/session', () => ({
  getSession: mockGetSession,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/lib/ai-runner/service', () => ({
  getAIRunnerService: mockGetAIRunnerService,
}));

import { POST } from './route';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/modules/ai-runner/profiles/validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/modules/ai-runner/profiles/validate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { userId: 'runner-admin' } } as never);
  });

  it('returns 401 when no session exists', async () => {
    mockGetSession.mockResolvedValue(null);
    const response = await POST(makeRequest({ invocationTemplate: 'echo hi' }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockGetAIRunnerService).not.toHaveBeenCalled();
  });

  it('validates and returns result for a valid payload', async () => {
    const expected = { valid: true };
    mockValidateProfileTemplate.mockResolvedValue(expected);

    const response = await POST(
      makeRequest({
        invocationTemplate: 'echo "hello"',
        runAsUser: 'alice',
        runAsUserAuthMode: 'passwordless-sudo',
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expected);
    expect(mockGetAIRunnerService).toHaveBeenCalledTimes(1);
    expect(mockValidateProfileTemplate).toHaveBeenCalledWith({
      invocationTemplate: 'echo "hello"',
      runAsUser: 'alice',
      runAsUserAuthMode: 'passwordless-sudo',
      shell: '/bin/bash',
    });
  });

  it('fills schema defaults before passing to the service', async () => {
    mockValidateProfileTemplate.mockResolvedValue({ valid: false });

    const response = await POST(makeRequest({ invocationTemplate: 'echo hi' }));

    expect(response.status).toBe(200);
    await response.json();
    const payload = mockValidateProfileTemplate.mock.calls[0]?.[0] as
      | {
          invocationTemplate: string;
          shell?: string;
          runAsUser?: string;
          runAsUserAuthMode?: string;
        }
      | undefined;

    expect(payload?.shell).toBe('/bin/bash');
    expect(payload?.runAsUserAuthMode).toBe('passwordless-sudo');
  });

  it('returns 400 for missing required fields', async () => {
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain('Invalid input');
    expect(mockValidateProfileTemplate).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid username format', async () => {
    const response = await POST(makeRequest({ invocationTemplate: 'echo hi', runAsUser: 'bad user!' }));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain('Run as user must be a valid OS username');
  });

  it('returns 500 when the service throws', async () => {
    mockValidateProfileTemplate.mockRejectedValue(new Error('runtime failure'));
    const response = await POST(makeRequest({ invocationTemplate: 'echo hi' }));
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Failed to validate profile');
  });

  it('returns 500 when request JSON parsing fails', async () => {
    const response = await POST(
      new Request('http://localhost/api/modules/ai-runner/profiles/validate', {
        method: 'POST',
        body: 'not-json',
      })
    );
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Failed to validate profile');
    expect(mockValidateProfileTemplate).not.toHaveBeenCalled();
  });
});
