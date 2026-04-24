/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetSession, mockFindById, mockDiagnosticRunCreate } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFindById: vi.fn(),
  mockDiagnosticRunCreate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/models/Node', () => ({
  default: { findById: mockFindById },
}));
vi.mock('@/models/DiagnosticRun', () => ({
  default: { create: mockDiagnosticRunCreate },
}));

import { POST } from './route';

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/fleet/nodes/node-1/reconcile', {
    method: 'POST',
  });
}

describe('POST /api/fleet/nodes/[id]/reconcile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDiagnosticRunCreate.mockImplementation(async (doc: Record<string, unknown>) => ({
      toObject: () => ({ ...doc, _id: 'run-1' }),
      _id: 'run-1',
    }));
  });

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeReq(), makeContext('node-1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when node not found', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    mockFindById.mockResolvedValue(null);
    const res = await POST(makeReq(), makeContext('node-1'));
    expect(res.status).toBe(404);
  });

  it('returns a healthy report with empty gaps when node is healthy', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    mockFindById.mockResolvedValue({
      toObject: () => ({
        lastSeen: new Date(),
        tunnelStatus: 'connected',
        proxyRules: [{ name: 'http', enabled: true, status: 'active' }],
      }),
    });

    const res = await POST(makeReq(), makeContext('node-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.report.healthy).toBe(true);
    expect(json.report.gaps).toEqual([]);
    expect(json.diagnosticRunId).toBe('run-1');
    expect(mockDiagnosticRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'client', targetId: 'node-1', steps: [] })
    );
  });

  it('persists gaps as DiagnosticRun steps when node is unhealthy', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    mockFindById.mockResolvedValue({
      toObject: () => ({
        lastSeen: new Date(Date.now() - 5 * 60_000),
        tunnelStatus: 'disconnected',
        lastBootAt: new Date(Date.now() - 10 * 60_000),
        proxyRules: [{ name: 'http', enabled: true, status: 'failed' }],
      }),
    });

    const res = await POST(makeReq(), makeContext('node-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.report.healthy).toBe(false);
    expect(json.report.gaps.length).toBeGreaterThanOrEqual(3);

    const call = mockDiagnosticRunCreate.mock.calls[0][0] as {
      kind: string;
      targetId: string;
      steps: Array<{ step: string; status: string }>;
      summary: string;
    };
    expect(call.kind).toBe('client');
    expect(call.targetId).toBe('node-1');
    expect(call.steps.some((s) => s.step === 'heartbeat_stale' && s.status === 'fail')).toBe(true);
    expect(call.steps.some((s) => s.step === 'tunnel_disconnected' && s.status === 'fail')).toBe(
      true
    );
    expect(call.steps.some((s) => s.step.startsWith('proxy_not_active'))).toBe(true);
    expect(call.summary).toMatch(/partial|fail/);
  });
});
