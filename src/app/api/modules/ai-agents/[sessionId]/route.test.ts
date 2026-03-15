/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetSession, mockTerminateSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockTerminateSession: vi.fn(),
}));

vi.mock('@/lib/ai-agents/service', () => ({
  aiAgentsService: {
    getSession: mockGetSession,
    terminateSession: mockTerminateSession,
  },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET, DELETE } from './route';

function makeContext(sessionId: string) {
  return { params: Promise.resolve({ sessionId }) };
}

const mockSession = {
  id: 'session-abc',
  status: 'running',
  agent: 'claude-code',
  owner: { pid: 1234, username: 'user' },
  lifecycle: { startTime: '2024-01-01T00:00:00Z' },
};

describe('GET /api/modules/ai-agents/[sessionId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns session when found', async () => {
    mockGetSession.mockResolvedValue(mockSession);
    const res = await GET(new NextRequest('http://localhost'), makeContext('session-abc'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe('session-abc');
    expect(json.status).toBe('running');
  });

  it('returns 404 when session not found', async () => {
    mockGetSession.mockResolvedValue(undefined);
    const res = await GET(new NextRequest('http://localhost'), makeContext('nonexistent'));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Session not found');
  });

  it('returns 500 on service error', async () => {
    mockGetSession.mockRejectedValue(new Error('scan failed'));
    const res = await GET(new NextRequest('http://localhost'), makeContext('session-abc'));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch session');
  });
});

describe('DELETE /api/modules/ai-agents/[sessionId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('terminates session successfully', async () => {
    mockTerminateSession.mockResolvedValue(true);
    const res = await DELETE(new NextRequest('http://localhost'), makeContext('session-abc'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('returns 404 when session not found or could not be terminated', async () => {
    mockTerminateSession.mockResolvedValue(false);
    const res = await DELETE(new NextRequest('http://localhost'), makeContext('nonexistent'));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Session not found or could not be terminated');
  });

  it('returns 500 on service error', async () => {
    mockTerminateSession.mockRejectedValue(new Error('kill failed'));
    const res = await DELETE(new NextRequest('http://localhost'), makeContext('session-abc'));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to terminate session');
  });
});
