/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAppFindOne,
  mockAppFind,
  mockAppUpdateMany,
  mockHeartbeatFindOne,
  mockReleaseLock,
  mockIsProcessGroupDead,
  mockHostname,
} = vi.hoisted(() => ({
  mockAppFindOne: vi.fn(),
  mockAppFind: vi.fn(),
  mockAppUpdateMany: vi.fn(),
  mockHeartbeatFindOne: vi.fn(),
  mockReleaseLock: vi.fn(),
  mockIsProcessGroupDead: vi.fn(),
  mockHostname: vi.fn(),
}));

vi.mock('@/models/AppOperation', () => ({
  default: { findOne: mockAppFindOne, find: mockAppFind, updateMany: mockAppUpdateMany },
}));
vi.mock('@/models/AppsWorkerHeartbeat', () => ({
  default: { findOne: mockHeartbeatFindOne },
}));
vi.mock('./operation-repository', () => ({
  releaseAppOperationLock: mockReleaseLock,
}));
vi.mock('../process-evidence', () => ({ isProcessGroupDead: mockIsProcessGroupDead }));
vi.mock('node:os', () => ({ default: { hostname: mockHostname } }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import {
  autoReleaseAppOperationLock,
  findRecoveryRequiredOperations,
  markOrphanedTerminalAppOperationLocks,
} from './operation-recovery';

const now = new Date('2026-07-31T05:04:00.000Z');

function recoveryRecord(overrides: Record<string, unknown> = {}) {
  return {
    operationId: 'op_1',
    appId: { toString: () => 'app-1' },
    lease: {
      workerId: 'old-worker',
      spawnPending: false,
      processes: [],
    },
    error: { code: 'RECOVERY_REQUIRED' },
    ...overrides,
  };
}

describe('autoReleaseAppOperationLock', () => {
  let currentRecord: Record<string, unknown> | null;
  let currentHeartbeat: Record<string, unknown> | null;

  beforeEach(() => {
    vi.clearAllMocks();
    mockHostname.mockReturnValue('worker-host');
    currentHeartbeat = { workerId: 'old-worker', hostname: 'worker-host' };
    mockHeartbeatFindOne.mockImplementation(() => ({
      lean: () => Promise.resolve(currentHeartbeat),
    }));
    mockReleaseLock.mockResolvedValue({ id: 'op_1' });
    mockIsProcessGroupDead.mockReturnValue(true);
    mockAppFindOne.mockImplementation(() => ({ lean: () => Promise.resolve(currentRecord) }));
    mockAppFind.mockImplementation(() => ({
      sort: () => ({
        limit: () => Promise.resolve([]),
      }),
    }));
    mockAppUpdateMany.mockResolvedValue({ modifiedCount: 0, matchedCount: 0 });
  });

  it('releases the lock when all recorded process groups are dead on this host', async () => {
    currentRecord = recoveryRecord({
      lease: {
        workerId: 'old-worker',
        spawnPending: false,
        processes: [{ pid: 4242, startTime: '567890' }],
      },
    });

    const released = await autoReleaseAppOperationLock({ operationId: 'op_1', now });

    expect(released).toBe(true);
    expect(mockIsProcessGroupDead).toHaveBeenCalledWith(4242, '567890');
    expect(mockReleaseLock).toHaveBeenCalledWith({
      operationId: 'op_1',
      reason: 'Recorded process groups verified stopped on the worker host',
      releasedBy: 'recovery',
      now,
    });
  });

  it('releases the lock when no process was ever recorded', async () => {
    currentRecord = recoveryRecord();

    expect(await autoReleaseAppOperationLock({ operationId: 'op_1', now })).toBe(true);
    expect(mockIsProcessGroupDead).not.toHaveBeenCalled();
  });

  it('keeps the lock when a tracked process group is still alive', async () => {
    currentRecord = recoveryRecord({
      lease: {
        workerId: 'old-worker',
        spawnPending: false,
        processes: [{ pid: 4242, startTime: '567890' }],
      },
    });
    mockIsProcessGroupDead.mockReturnValue(false);

    expect(await autoReleaseAppOperationLock({ operationId: 'op_1', now })).toBe(false);
    expect(mockReleaseLock).not.toHaveBeenCalled();
  });

  it('keeps the lock when a spawn may not have been tracked', async () => {
    currentRecord = recoveryRecord({
      lease: { workerId: 'old-worker', spawnPending: true, processes: [] },
    });

    expect(await autoReleaseAppOperationLock({ operationId: 'op_1', now })).toBe(false);
    expect(mockReleaseLock).not.toHaveBeenCalled();
  });

  it('keeps the lock when the previous worker ran on another host', async () => {
    currentRecord = recoveryRecord();
    currentHeartbeat = { workerId: 'old-worker', hostname: 'other-host' };

    expect(await autoReleaseAppOperationLock({ operationId: 'op_1', now })).toBe(false);
    expect(mockReleaseLock).not.toHaveBeenCalled();
  });

  it('keeps the lock when the previous worker heartbeat is unknown', async () => {
    currentRecord = recoveryRecord();
    currentHeartbeat = null;

    expect(await autoReleaseAppOperationLock({ operationId: 'op_1', now })).toBe(false);
  });

  it('keeps the lock when the record has no previous worker id', async () => {
    currentRecord = recoveryRecord({ lease: { spawnPending: false, processes: [] } });

    expect(await autoReleaseAppOperationLock({ operationId: 'op_1', now })).toBe(false);
  });

  it('keeps the lock when no recovery-required record matches', async () => {
    currentRecord = null;

    expect(await autoReleaseAppOperationLock({ operationId: 'op_1', now })).toBe(false);
  });

  it('keeps the lock when the release update no longer matches', async () => {
    currentRecord = recoveryRecord();
    mockReleaseLock.mockResolvedValue(null);

    expect(await autoReleaseAppOperationLock({ operationId: 'op_1', now })).toBe(false);
  });
});

describe('markOrphanedTerminalAppOperationLocks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('re-marks finished-but-active locks as recovery-required', async () => {
    const now = new Date('2026-11-22T02:00:00.000Z');
    mockAppUpdateMany.mockResolvedValue({ modifiedCount: 1, matchedCount: 1 });

    await expect(markOrphanedTerminalAppOperationLocks({ now })).resolves.toBe(1);
    expect(mockAppUpdateMany).toHaveBeenCalledWith(
      {
        active: true,
        status: { $in: ['succeeded', 'failed', 'cancelled', 'unchanged'] },
        'error.code': { $ne: 'RECOVERY_REQUIRED' },
        $or: [
          { 'lease.expiresAt': { $lte: now } },
          {
            'lease.expiresAt': { $exists: false },
            completedAt: { $lte: new Date('2026-11-22T01:59:30.000Z') },
          },
        ],
      },
      {
        $set: {
          'error.code': 'RECOVERY_REQUIRED',
          'error.message':
            'Recovery required: this finished operation still holds the app lock; release it after verifying the previous worker stopped',
          'error.details.orphanedLock': true,
          'error.details.markedAt': now.toISOString(),
        },
      }
    );
  });

  it('reports zero when no orphaned lock matches', async () => {
    mockAppUpdateMany.mockResolvedValue({ modifiedCount: 0, matchedCount: 0 });

    await expect(markOrphanedTerminalAppOperationLocks()).resolves.toBe(0);
  });
});

describe('findRecoveryRequiredOperations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists active recovery-required operation ids with a bounded, oldest-first query', async () => {
    const limitSpy = vi.fn().mockReturnValue({
      lean: () =>
        Promise.resolve([
          { operationId: 'op_old', appId: { toString: () => 'app-1' } },
          { operationId: 'op_new', appId: { toString: () => 'app-2' } },
        ]),
    });
    const sortSpy = vi.fn().mockReturnValue({ limit: limitSpy });
    mockAppFind.mockReturnValue({ sort: sortSpy });

    await expect(findRecoveryRequiredOperations(25)).resolves.toEqual([
      { operationId: 'op_old' },
      { operationId: 'op_new' },
    ]);
    expect(mockAppFind).toHaveBeenCalledWith({
      active: true,
      'error.code': 'RECOVERY_REQUIRED',
    });
    expect(sortSpy).toHaveBeenCalledWith({ queuedAt: 1, _id: 1 });
    expect(limitSpy).toHaveBeenCalledWith(25);
  });
});
