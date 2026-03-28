/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSession, mockTriggerUpdate, mockListUpdateRuns, mockGetUpdateRunDetails } =
  vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockTriggerUpdate: vi.fn(),
    mockListUpdateRuns: vi.fn(),
    mockGetUpdateRunDetails: vi.fn(),
  }));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/updates/system-service', () => ({
  systemUpdateService: {
    triggerUpdate: mockTriggerUpdate,
    listUpdateRuns: mockListUpdateRuns,
    getUpdateRunDetails: mockGetUpdateRunDetails,
  },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET, POST } from './route';

describe('GET /api/modules/updates/run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const req = new Request('http://localhost/api/modules/updates/run');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns list of runs', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockListUpdateRuns.mockResolvedValue([
      { runId: '123', status: 'completed', startedAt: '2024-01-01T00:00:00Z', pid: 100, exitCode: 0, timestamp: '2024-01-01T00:00:00Z' },
    ]);
    const req = new Request('http://localhost/api/modules/updates/run');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.runs).toHaveLength(1);
    expect(json.runs[0].runId).toBe('123');
  });

  it('returns details for a specific run', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockGetUpdateRunDetails.mockResolvedValue({
      runId: '456',
      status: 'running',
      pid: 200,
      exitCode: null,
      startedAt: '2024-01-01T00:00:00Z',
      timestamp: '2024-01-01T00:00:00Z',
      logContent: 'some log output',
    });
    const req = new Request('http://localhost/api/modules/updates/run?runId=456');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.runId).toBe('456');
    expect(json.logContent).toBe('some log output');
  });

  it('returns 404 when run not found', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockGetUpdateRunDetails.mockResolvedValue(null);
    const req = new Request('http://localhost/api/modules/updates/run?runId=nonexistent');
    const res = await GET(req);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/modules/updates/run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns success with runId when update triggered', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockTriggerUpdate.mockResolvedValue({ success: true, message: 'Update started', pid: 1234, runId: 'run-1' });
    const res = await POST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.pid).toBe(1234);
    expect(json.runId).toBe('run-1');
  });

  it('returns 500 when update trigger fails', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockTriggerUpdate.mockResolvedValue({ success: false, message: 'Already running' });
    const res = await POST();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Already running');
  });

  it('returns 500 when service throws', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockTriggerUpdate.mockRejectedValue(new Error('unexpected'));
    const res = await POST();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Internal server error while triggering update');
  });
});
