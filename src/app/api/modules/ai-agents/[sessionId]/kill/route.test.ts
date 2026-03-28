/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockKillSession } = vi.hoisted(() => ({
  mockKillSession: vi.fn(),
}));

vi.mock('@/lib/ai-agents/service', () => ({
  getAIAgentsService: () => ({ killSession: mockKillSession }),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { POST } from './route';

function makeContext(sessionId: string) {
  return { params: Promise.resolve({ sessionId }) };
}

describe('POST /api/modules/ai-agents/[sessionId]/kill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('kills session successfully', async () => {
    mockKillSession.mockResolvedValue(true);
    const res = await POST(
      new NextRequest('http://localhost', { method: 'POST' }),
      makeContext('session-abc')
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('returns 404 when session not found or could not be killed', async () => {
    mockKillSession.mockResolvedValue(false);
    const res = await POST(
      new NextRequest('http://localhost', { method: 'POST' }),
      makeContext('nonexistent')
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Session not found or could not be killed');
  });

  it('returns 500 on service error', async () => {
    mockKillSession.mockRejectedValue(new Error('SIGKILL failed'));
    const res = await POST(
      new NextRequest('http://localhost', { method: 'POST' }),
      makeContext('session-abc')
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to kill session');
  });
});
