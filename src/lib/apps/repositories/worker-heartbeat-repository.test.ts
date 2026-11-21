/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFindOne, mockFindOneAndUpdate } = vi.hoisted(() => ({
  mockFindOne: vi.fn(),
  mockFindOneAndUpdate: vi.fn(),
}));

vi.mock('@/models/AppsWorkerHeartbeat', () => ({
  default: {
    findOne: mockFindOne,
    findOneAndUpdate: mockFindOneAndUpdate,
  },
}));

import {
  getAppsWorkerAvailability,
  markAppsWorkerStopped,
  upsertAppsWorkerHeartbeat,
} from './worker-heartbeat-repository';

const now = new Date('2026-08-01T05:00:00.000Z');
const terminalFenceCases = [
  ['draining', ['starting', 'running', 'draining']],
  ['failed', ['starting', 'running', 'draining', 'failed']],
] as const;

function newestHeartbeat(value: unknown) {
  const lean = vi.fn().mockResolvedValue(value);
  const sort = vi.fn().mockReturnValue({ lean });
  mockFindOne.mockReturnValue({ sort });
  return { sort, lean };
}

describe('getAppsWorkerAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports a recently heartbeating running worker as healthy', async () => {
    newestHeartbeat({
      workerId: 'worker-1',
      status: 'running',
      lastSeenAt: new Date('2026-08-01T04:59:45.000Z'),
    });

    await expect(getAppsWorkerAvailability({ now })).resolves.toEqual({
      available: true,
      reason: 'healthy',
      workerId: 'worker-1',
      lastSeenAt: new Date('2026-08-01T04:59:45.000Z'),
    });
  });

  it('reports a missing heartbeat as unavailable', async () => {
    newestHeartbeat(null);

    await expect(getAppsWorkerAvailability({ now })).resolves.toEqual({
      available: false,
      reason: 'missing',
    });
  });

  it('reports the newest running heartbeat as stale after twenty seconds', async () => {
    newestHeartbeat({
      workerId: 'worker-1',
      status: 'running',
      lastSeenAt: new Date('2026-08-01T04:59:39.999Z'),
    });

    await expect(getAppsWorkerAvailability({ now })).resolves.toMatchObject({
      available: false,
      reason: 'stale',
      workerId: 'worker-1',
    });
  });

  it.each(['starting', 'draining', 'stopped', 'failed'] as const)(
    'reports a fresh %s heartbeat as not running',
    async (status) => {
      newestHeartbeat({
        workerId: 'worker-1',
        status,
        lastSeenAt: new Date('2026-08-01T04:59:59.000Z'),
      });

      await expect(getAppsWorkerAvailability({ now })).resolves.toMatchObject({
        available: false,
        reason: 'not_running',
        workerId: 'worker-1',
      });
    }
  );

  it('selects the newest heartbeat record', async () => {
    const { sort } = newestHeartbeat(null);

    await getAppsWorkerAvailability({ now });

    expect(sort).toHaveBeenCalledWith({ lastSeenAt: -1 });
  });
});

describe('Apps worker heartbeat writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindOneAndUpdate.mockResolvedValue(null);
  });

  it('publishes current operation ownership and clears a previous error', async () => {
    await upsertAppsWorkerHeartbeat({
      workerId: 'worker-1',
      status: 'running',
      hostname: 'server-1',
      pid: 42,
      currentOperationId: 'op_1',
      leaseGeneration: 7,
      now,
    });

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      {
        workerId: 'worker-1',
        status: { $in: ['starting', 'running'] },
      },
      {
        $set: {
          status: 'running',
          hostname: 'server-1',
          pid: 42,
          version: undefined,
          currentOperationId: 'op_1',
          leaseGeneration: 7,
          lastSeenAt: now,
        },
        $unset: { error: 1 },
        $setOnInsert: { startedAt: now },
      },
      { upsert: false, new: true }
    );
  });

  it('removes stale operation metadata when the worker becomes idle', async () => {
    await upsertAppsWorkerHeartbeat({
      workerId: 'worker-1',
      status: 'running',
      hostname: 'server-1',
      pid: 42,
      now,
    });

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      {
        workerId: 'worker-1',
        status: { $in: ['starting', 'running'] },
      },
      expect.objectContaining({
        $unset: {
          currentOperationId: 1,
          leaseGeneration: 1,
          error: 1,
        },
      }),
      { upsert: false, new: true }
    );
  });

  it('creates only the initial starting heartbeat record', async () => {
    await upsertAppsWorkerHeartbeat({
      workerId: 'worker-1',
      status: 'starting',
      hostname: 'server-1',
      pid: 42,
      now,
    });

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { workerId: 'worker-1' },
      expect.any(Object),
      { upsert: true, new: true }
    );
  });

  it.each(terminalFenceCases)(
    'fences a %s heartbeat against terminal status regression',
    async (status, allowed) => {
      await upsertAppsWorkerHeartbeat({
        workerId: 'worker-1',
        status,
        hostname: 'server-1',
        pid: 42,
        now,
      });

      expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
        { workerId: 'worker-1', status: { $in: allowed } },
        expect.any(Object),
        { upsert: false, new: true }
      );
    }
  );

  it('clears current operation ownership when a drained worker stops', async () => {
    await markAppsWorkerStopped('worker-1', now);

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      {
        workerId: 'worker-1',
        status: { $in: ['starting', 'running', 'draining', 'stopped'] },
      },
      {
        $set: { status: 'stopped', lastSeenAt: now, stoppedAt: now },
        $unset: { currentOperationId: 1, leaseGeneration: 1, error: 1 },
      }
    );
  });
});
