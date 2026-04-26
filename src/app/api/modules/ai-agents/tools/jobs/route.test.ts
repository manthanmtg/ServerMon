/** @vitest-environment node */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetSession, mockStart, mockList } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockStart: vi.fn(),
  mockList: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSession: mockGetSession,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/ai-agents/tool-jobs', () => ({
  getAgentToolJobStore: () => ({ start: mockStart, list: mockList }),
}));

import { GET, POST } from './route';

function request(body: unknown): Request {
  return new Request('http://localhost/api/modules/ai-agents/tools/jobs', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('/api/modules/ai-agents/tools/jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { username: 'alice', role: 'admin' } });
    mockList.mockReturnValue([]);
  });

  it('requires authentication', async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await POST(request({ toolType: 'gemini-cli', action: 'update' }));

    expect(res.status).toBe(401);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('starts an update job for a known tool action', async () => {
    mockStart.mockReturnValue({
      id: 'job-1',
      toolType: 'gemini-cli',
      action: 'update',
      status: 'running',
      output: '',
    });

    const res = await POST(request({ toolType: 'gemini-cli', action: 'update' }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.job.id).toBe('job-1');
    expect(mockStart).toHaveBeenCalledWith('gemini-cli', 'update');
  });

  it('lists recent jobs for modal resume', async () => {
    mockList.mockReturnValue([{ id: 'job-1', toolType: 'codex', action: 'update' }]);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.jobs).toHaveLength(1);
  });
});
