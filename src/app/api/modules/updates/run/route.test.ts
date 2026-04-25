/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGetSession,
  mockTriggerUpdate,
  mockTriggerSystemPackageUpdate,
  mockTriggerAgentUpdate,
  mockListUpdateRuns,
  mockGetUpdateRunDetails,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockTriggerUpdate: vi.fn(),
  mockTriggerSystemPackageUpdate: vi.fn(),
  mockTriggerAgentUpdate: vi.fn(),
  mockListUpdateRuns: vi.fn(),
  mockGetUpdateRunDetails: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/updates/system-service', () => ({
  systemUpdateService: {
    triggerUpdate: mockTriggerUpdate,
    triggerSystemPackageUpdate: mockTriggerSystemPackageUpdate,
    triggerAgentUpdate: mockTriggerAgentUpdate,
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
      {
        runId: '123',
        status: 'completed',
        startedAt: '2024-01-01T00:00:00Z',
        pid: 100,
        exitCode: 0,
        timestamp: '2024-01-01T00:00:00Z',
      },
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
    const req = new Request('http://localhost/api/modules/updates/run', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('defaults to servermon update when no body', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockTriggerUpdate.mockResolvedValue({
      success: true,
      message: 'Update started',
      pid: 1234,
      runId: 'run-1',
    });
    const req = new Request('http://localhost/api/modules/updates/run', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.runId).toBe('run-1');
    expect(mockTriggerUpdate).toHaveBeenCalled();
    expect(mockTriggerSystemPackageUpdate).not.toHaveBeenCalled();
  });

  it('calls triggerSystemPackageUpdate when type is packages', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockTriggerSystemPackageUpdate.mockResolvedValue({
      success: true,
      message: 'Update started',
      pid: 5678,
      runId: 'pkg-1',
    });
    const req = new Request('http://localhost/api/modules/updates/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'packages' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.runId).toBe('pkg-1');
    expect(mockTriggerSystemPackageUpdate).toHaveBeenCalled();
    expect(mockTriggerUpdate).not.toHaveBeenCalled();
  });

  it('calls triggerAgentUpdate when type is agent', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockTriggerAgentUpdate.mockResolvedValue({
      success: true,
      message: 'Agent update started',
      pid: 5679,
      runId: 'agent-1',
    });
    const req = new Request('http://localhost/api/modules/updates/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'agent' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.runId).toBe('agent-1');
    expect(mockTriggerAgentUpdate).toHaveBeenCalled();
    expect(mockTriggerSystemPackageUpdate).not.toHaveBeenCalled();
    expect(mockTriggerUpdate).not.toHaveBeenCalled();
  });

  it('returns 500 when update trigger fails', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockTriggerUpdate.mockResolvedValue({ success: false, message: 'Already running' });
    const req = new Request('http://localhost/api/modules/updates/run', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Already running');
  });

  it('returns 500 when service throws', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockTriggerUpdate.mockRejectedValue(new Error('unexpected'));
    const req = new Request('http://localhost/api/modules/updates/run', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Internal server error while triggering update');
  });
});
