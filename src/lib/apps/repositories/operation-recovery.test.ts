/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAppFindOne,
  mockHeartbeatFindOne,
  mockReleaseLock,
  mockIsProcessGroupDead,
  mockHostname,
} = vi.hoisted(() => ({
  mockAppFindOne: vi.fn(),
  mockHeartbeatFindOne: vi.fn(),
  mockReleaseLock: vi.fn(),
  mockIsProcessGroupDead: vi.fn(),
  mockHostname: vi.fn(),
}));

vi.mock('@/models/AppOperation', () => ({ default: { findOne: mockAppFindOne } }));
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

import { autoReleaseAppOperationLock } from './operation-recovery';

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
