/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockFindById,
  mockFindByIdAndUpdate,
  mockUpdateOne,
  mockFleetLogCreate,
  mockFleetLogInsertMany,
  mockVerifyPairingToken,
  mockEmit,
} = vi.hoisted(() => ({
  mockFindById: vi.fn(),
  mockFindByIdAndUpdate: vi.fn(),
  mockUpdateOne: vi.fn(),
  mockFleetLogCreate: vi.fn(),
  mockFleetLogInsertMany: vi.fn(),
  mockVerifyPairingToken: vi.fn(),
  mockEmit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/fleet/pairing', () => ({
  verifyPairingToken: mockVerifyPairingToken,
}));
vi.mock('@/lib/fleet/eventBus', () => ({
  fleetEventBus: {
    emit: mockEmit,
    subscribe: vi.fn(),
    subscribeFiltered: vi.fn(),
  },
}));
vi.mock('@/models/Node', () => ({
  default: {
    findById: mockFindById,
    findByIdAndUpdate: mockFindByIdAndUpdate,
    updateOne: mockUpdateOne,
  },
}));
vi.mock('@/models/FleetLogEvent', () => ({
  default: { create: mockFleetLogCreate, insertMany: mockFleetLogInsertMany },
}));

import { POST } from './route';

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeReq(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/fleet/nodes/node-1/heartbeat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const validHeartbeat = {
  nodeId: 'node-1',
  bootId: 'boot-xyz',
  bootAt: new Date('2024-01-01T00:00:00Z').toISOString(),
  agentVersion: '0.1.0',
  frpcVersion: '0.58.0',
  hardware: { cpuCount: 4, totalRam: 8192 },
  metrics: { cpuLoad: 0.25, ramUsed: 1024, uptime: 3600 },
  tunnel: { status: 'connected', connectedSince: new Date().toISOString() },
  proxies: [{ name: 'web', status: 'active' }],
  capabilities: { terminal: true, metrics: true },
};

describe('POST /api/fleet/nodes/[id]/heartbeat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFleetLogCreate.mockResolvedValue({});
    mockFleetLogInsertMany.mockResolvedValue([]);
    mockFindByIdAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ pendingCommands: [] }),
    });
    mockUpdateOne.mockResolvedValue({});
  });

  it('returns 401 without Authorization', async () => {
    const res = await POST(makeReq(validHeartbeat), makeContext('node-1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 on bad token', async () => {
    mockFindById.mockResolvedValue({ pairingTokenHash: 'h' });
    mockVerifyPairingToken.mockResolvedValue(false);
    const res = await POST(
      makeReq(validHeartbeat, { Authorization: 'Bearer wrong' }),
      makeContext('node-1')
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when node is missing', async () => {
    mockFindById.mockResolvedValue(null);
    const res = await POST(
      makeReq(validHeartbeat, { Authorization: 'Bearer tok' }),
      makeContext('node-1')
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 on invalid heartbeat body', async () => {
    mockFindById.mockResolvedValue({ pairingTokenHash: 'h' });
    mockVerifyPairingToken.mockResolvedValue(true);
    const res = await POST(
      makeReq({ nodeId: 'x' }, { Authorization: 'Bearer tok' }),
      makeContext('node-1')
    );
    expect(res.status).toBe(400);
  });

  it('updates node with heartbeat data on valid request', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const nodeDoc = {
      pairingTokenHash: 'h',
      bootId: undefined,
      tunnelStatus: 'disconnected',
      proxyRules: [{ name: 'web', enabled: true, status: 'disabled' }],
      capabilities: {
        terminal: true,
        endpointRuns: true,
        processes: true,
        metrics: true,
        publishRoutes: true,
        tcpForward: true,
        fileOps: false,
        updates: true,
      },
      save: saveFn,
    };
    mockFindById.mockResolvedValue(nodeDoc);
    mockVerifyPairingToken.mockResolvedValue(true);

    const res = await POST(
      makeReq(validHeartbeat, { Authorization: 'Bearer tok' }),
      makeContext('node-1')
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
      'node-1',
      expect.objectContaining({
        $set: expect.objectContaining({
          tunnelStatus: 'connected',
          bootId: 'boot-xyz',
        }),
      }),
      { returnDocument: 'after' }
    );
    expect(saveFn).not.toHaveBeenCalled();
  });

  it('emits node.reboot_detected on boot id change', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const nodeDoc = {
      pairingTokenHash: 'h',
      bootId: 'old-boot',
      tunnelStatus: 'connected',
      proxyRules: [],
      capabilities: {},
      save: saveFn,
    };
    mockFindById.mockResolvedValue(nodeDoc);
    mockVerifyPairingToken.mockResolvedValue(true);

    const res = await POST(
      makeReq(validHeartbeat, { Authorization: 'Bearer tok' }),
      makeContext('node-1')
    );
    expect(res.status).toBe(200);
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'node.reboot_detected' })
    );
  });

  it('emits node.reconnected on disconnected -> connected transition', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const nodeDoc = {
      pairingTokenHash: 'h',
      bootId: 'boot-xyz',
      tunnelStatus: 'disconnected',
      proxyRules: [],
      capabilities: {},
      save: saveFn,
    };
    mockFindById.mockResolvedValue(nodeDoc);
    mockVerifyPairingToken.mockResolvedValue(true);

    const res = await POST(
      makeReq(validHeartbeat, { Authorization: 'Bearer tok' }),
      makeContext('node-1')
    );
    expect(res.status).toBe(200);
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'node.reconnected' })
    );
  });

  it('emits fleet event bus node.heartbeat on every successful heartbeat', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const nodeDoc = {
      pairingTokenHash: 'h',
      bootId: 'boot-xyz',
      tunnelStatus: 'connected',
      proxyRules: [],
      capabilities: {},
      save: saveFn,
    };
    mockFindById.mockResolvedValue(nodeDoc);
    mockVerifyPairingToken.mockResolvedValue(true);

    const res = await POST(
      makeReq(validHeartbeat, { Authorization: 'Bearer tok' }),
      makeContext('node-1')
    );
    expect(res.status).toBe(200);
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'node.heartbeat',
        nodeId: 'node-1',
        at: expect.any(String),
        data: expect.objectContaining({ tunnelStatus: 'connected' }),
      })
    );
  });

  it('emits fleet event bus node.reboot on boot id change', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const nodeDoc = {
      pairingTokenHash: 'h',
      bootId: 'old-boot',
      tunnelStatus: 'connected',
      proxyRules: [],
      capabilities: {},
      save: saveFn,
    };
    mockFindById.mockResolvedValue(nodeDoc);
    mockVerifyPairingToken.mockResolvedValue(true);

    const res = await POST(
      makeReq(validHeartbeat, { Authorization: 'Bearer tok' }),
      makeContext('node-1')
    );
    expect(res.status).toBe(200);
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'node.reboot',
        nodeId: 'node-1',
        data: expect.objectContaining({
          previousBootId: 'old-boot',
          newBootId: 'boot-xyz',
        }),
      })
    );
  });

  it('persists piggy-backed log entries via FleetLogEvent.insertMany', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const nodeDoc = {
      pairingTokenHash: 'h',
      bootId: 'boot-xyz',
      tunnelStatus: 'connected',
      proxyRules: [],
      capabilities: {},
      save: saveFn,
    };
    mockFindById.mockResolvedValue(nodeDoc);
    mockVerifyPairingToken.mockResolvedValue(true);

    const beat = {
      ...validHeartbeat,
      logs: [
        {
          level: 'info',
          eventType: 'agent.frpc.log',
          message: 'login to server success',
          timestamp: new Date().toISOString(),
        },
        {
          level: 'warn',
          eventType: 'agent.frpc.log',
          message: 'work connection closed',
        },
      ],
    };

    const res = await POST(makeReq(beat, { Authorization: 'Bearer tok' }), makeContext('node-1'));
    expect(res.status).toBe(200);
    expect(mockFleetLogInsertMany).toHaveBeenCalledTimes(1);
    const docs = mockFleetLogInsertMany.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(docs).toHaveLength(2);
    expect(docs[0]).toMatchObject({
      nodeId: 'node-1',
      service: 'agent',
      level: 'info',
      eventType: 'agent.frpc.log',
      message: 'login to server success',
    });
    expect(docs[1]).toMatchObject({ level: 'warn', message: 'work connection closed' });
  });

  it('does not call insertMany when no logs are provided', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    mockFindById.mockResolvedValue({
      pairingTokenHash: 'h',
      bootId: 'boot-xyz',
      tunnelStatus: 'connected',
      proxyRules: [],
      capabilities: {},
      save: saveFn,
    });
    mockVerifyPairingToken.mockResolvedValue(true);

    const res = await POST(
      makeReq(validHeartbeat, { Authorization: 'Bearer tok' }),
      makeContext('node-1')
    );
    expect(res.status).toBe(200);
    expect(mockFleetLogInsertMany).not.toHaveBeenCalled();
  });

  it('emits fleet event bus node.status_change when tunnel status changes', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const nodeDoc = {
      pairingTokenHash: 'h',
      bootId: 'boot-xyz',
      tunnelStatus: 'disconnected',
      proxyRules: [],
      capabilities: {},
      save: saveFn,
    };
    mockFindById.mockResolvedValue(nodeDoc);
    mockVerifyPairingToken.mockResolvedValue(true);

    const res = await POST(
      makeReq(validHeartbeat, { Authorization: 'Bearer tok' }),
      makeContext('node-1')
    );
    expect(res.status).toBe(200);
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'node.status_change',
        nodeId: 'node-1',
        data: expect.objectContaining({ from: 'disconnected', to: 'connected' }),
      })
    );
  });
});
