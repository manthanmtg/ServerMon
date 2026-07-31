/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaimedAppOperation } from '../repositories/operation-repository';
import { runAppsWorkerOnce } from './runner';

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const now = new Date('2026-07-31T05:00:00.000Z');
const leaseExpiresAt = new Date('2026-07-31T05:00:30.000Z');

function claimedOperation(overrides: Partial<ClaimedAppOperation> = {}): ClaimedAppOperation {
  return {
    id: 'op_1',
    appId: 'app-1',
    appSlug: 'demo',
    type: 'deploy',
    status: 'running',
    phase: 'claiming',
    createdAt: '2026-07-31T04:59:00.000Z',
    workerId: 'worker-1',
    leaseGeneration: 1,
    configSnapshot: {},
    ...overrides,
  };
}

describe('runAppsWorkerOnce', () => {
  const claimNextAppOperation = vi.fn();
  const finishAppOperationRecord = vi.fn();
  const execute = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns idle when no operation can be claimed', async () => {
    claimNextAppOperation.mockResolvedValue(null);

    const result = await runAppsWorkerOnce({
      workerId: 'worker-1',
      now: () => now,
      leaseExpiresAt: () => leaseExpiresAt,
      claimNextAppOperation,
      finishAppOperationRecord,
      execute,
    });

    expect(result).toEqual({ claimed: false });
    expect(execute).not.toHaveBeenCalled();
  });

  it('executes a claimed operation and marks it succeeded', async () => {
    claimNextAppOperation.mockResolvedValue(claimedOperation());
    execute.mockResolvedValue({ status: 'succeeded', result: { releaseId: 'release-1' } });

    const result = await runAppsWorkerOnce({
      workerId: 'worker-1',
      now: () => now,
      leaseExpiresAt: () => leaseExpiresAt,
      claimNextAppOperation,
      finishAppOperationRecord,
      execute,
    });

    expect(claimNextAppOperation).toHaveBeenCalledWith({
      workerId: 'worker-1',
      now,
      leaseExpiresAt,
    });
    expect(execute).toHaveBeenCalledWith(claimedOperation());
    expect(finishAppOperationRecord).toHaveBeenCalledWith({
      operationId: 'op_1',
      status: 'succeeded',
      result: { releaseId: 'release-1' },
      now,
    });
    expect(result).toEqual({ claimed: true, operationId: 'op_1', status: 'succeeded' });
  });

  it('marks unchanged executor results as unchanged', async () => {
    claimNextAppOperation.mockResolvedValue(claimedOperation({ type: 'update' }));
    execute.mockResolvedValue({ status: 'unchanged', result: { releaseId: 'release-1' } });

    await runAppsWorkerOnce({
      workerId: 'worker-1',
      now: () => now,
      leaseExpiresAt: () => leaseExpiresAt,
      claimNextAppOperation,
      finishAppOperationRecord,
      execute,
    });

    expect(finishAppOperationRecord).toHaveBeenCalledWith({
      operationId: 'op_1',
      status: 'unchanged',
      result: { releaseId: 'release-1' },
      now,
    });
  });

  it('marks executor errors as failed with stable error details', async () => {
    claimNextAppOperation.mockResolvedValue(claimedOperation());
    execute.mockRejectedValue(new Error('Build failed'));

    const result = await runAppsWorkerOnce({
      workerId: 'worker-1',
      now: () => now,
      leaseExpiresAt: () => leaseExpiresAt,
      claimNextAppOperation,
      finishAppOperationRecord,
      execute,
    });

    expect(finishAppOperationRecord).toHaveBeenCalledWith({
      operationId: 'op_1',
      status: 'failed',
      error: {
        code: 'LEGACY_EXECUTOR_FAILED',
        message: 'Build failed',
        retryable: false,
      },
      now,
    });
    expect(result).toEqual({ claimed: true, operationId: 'op_1', status: 'failed' });
  });
});
