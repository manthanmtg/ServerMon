/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetSession,
  mockNodeFindById,
  mockNodeUpdateOne,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockNodeFindById: vi.fn(),
  mockNodeUpdateOne: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/models/Node', () => ({
  default: {
    findById: mockNodeFindById,
    updateOne: mockNodeUpdateOne,
  },
}));

import { POST } from './route';

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/fleet/nodes/node-1/servermon/recheck', {
    method: 'POST',
  });
}

function makeContext(id = 'node-1') {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/fleet/nodes/[id]/servermon/recheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    mockNodeFindById.mockResolvedValue({ _id: 'node-1', name: 'Test Node' });
    mockNodeUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  it('successfully queues a recheck command', async () => {
    const res = await POST(makeReq(), makeContext());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, queued: true });

    expect(mockNodeFindById).toHaveBeenCalledWith('node-1');
    expect(mockNodeUpdateOne).toHaveBeenCalledWith(
      { _id: 'node-1' },
      expect.objectContaining({
        $push: {
          pendingCommands: expect.objectContaining({
            command: 'servermon-recheck',
            issuedAt: expect.any(Date),
            id: expect.any(String),
          }),
        },
      })
    );
  });

  it('returns 401 when no session is present', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeReq(), makeContext());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 404 when node is not found', async () => {
    mockNodeFindById.mockResolvedValue(null);
    const res = await POST(makeReq(), makeContext());
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Node not found');
  });

  it('returns 500 when database update fails', async () => {
    mockNodeUpdateOne.mockRejectedValue(new Error('DB Error'));
    const res = await POST(makeReq(), makeContext());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to queue ServerMon recheck');
  });
});
