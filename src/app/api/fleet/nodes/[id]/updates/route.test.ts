/** @vitest-environment node */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetSession, mockFindById, mockUpdateOne, mockFleetLogCreate } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFindById: vi.fn(),
  mockUpdateOne: vi.fn(),
  mockFleetLogCreate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/fleet/rbac', () => ({ enforceRbac: vi.fn(() => null) }));
vi.mock('@/models/Node', () => ({
  default: {
    findById: mockFindById,
    updateOne: mockUpdateOne,
  },
}));
vi.mock('@/models/FleetLogEvent', () => ({
  default: {
    create: mockFleetLogCreate,
  },
}));

import { POST } from './route';

function req(body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/fleet/nodes/node-1/updates', {
    method: 'POST',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function ctx(id = 'node-1') {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/fleet/nodes/[id]/updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    mockFindById.mockResolvedValue({ _id: 'node-1', name: 'Node One' });
    mockUpdateOne.mockResolvedValue({});
    mockFleetLogCreate.mockResolvedValue({});
  });

  it('queues update command arguments for release and source overrides', async () => {
    const res = await POST(
      req({
        mode: 'release',
        versionTarget: 'v0.1.1',
        releaseBaseUrl: 'https://mirror.example/releases/v0.1.1',
        sourceRef: 'main',
      }),
      ctx()
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.commandId).toEqual(expect.any(String));
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: 'node-1' },
      {
        $push: {
          pendingCommands: expect.objectContaining({
            id: body.commandId,
            command: 'update',
            args: {
              mode: 'release',
              versionTarget: 'v0.1.1',
              releaseBaseUrl: 'https://mirror.example/releases/v0.1.1',
              sourceRef: 'main',
            },
          }),
        },
      }
    );
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 'node-1',
        service: 'agent',
        level: 'info',
        eventType: 'agent.update.queued',
        metadata: expect.objectContaining({ commandId: body.commandId }),
      })
    );
  });
});
