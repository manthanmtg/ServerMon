/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AcceptedAppOperation, AppV2OperationStatus } from '@/modules/apps/types';
import type { ClaimedAppOperation } from '../repositories/operation-repository';
import {
  APPS_OPERATION_LEASE_LOST_MESSAGE,
  AppOperationLeaseLostError,
  runAppsWorkerOnce,
  startAppsWorkerRunner,
} from './runner';

const { mockLogWarn } = vi.hoisted(() => ({ mockLogWarn: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: mockLogWarn, error: vi.fn(), debug: vi.fn() }),
}));

const now = new Date('2026-07-31T05:00:00.000Z');
const leaseExpiresAt = new Date('2026-07-31T05:00:30.000Z');
const deadlineAt = new Date('2026-07-31T06:00:00.000Z');

function claimedOperation(overrides: Partial<ClaimedAppOperation> = {}): ClaimedAppOperation {
  return {
    id: 'op_1',
    appId: 'app-1',
    appSlug: 'demo',
    type: 'deploy',
    status: 'running',
    phase: 'claiming',
    createdAt: '2026-07-31T04:59:00.000Z',
    startedAt: now.toISOString(),
    deadlineAt: deadlineAt.toISOString(),
    workerId: 'worker-1',
    leaseGeneration: 1,
    configSnapshot: {},
    ...overrides,
  };
}

function acceptedOperation(status: AppV2OperationStatus = 'succeeded'): AcceptedAppOperation {
  return {
    id: 'op_1',
    appId: 'app-1',
    type: 'deploy',
    status,
    phase: 'terminal',
    createdAt: '2026-07-31T04:59:00.000Z',
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('runAppsWorkerOnce', () => {
  const recoverExpiredAppOperationRecord = vi.fn();
  const claimNextAppOperation = vi.fn();
  const renewAppOperationLease = vi.fn();
  const finishAppOperationRecord = vi.fn();
  const execute = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    recoverExpiredAppOperationRecord.mockResolvedValue(null);
    claimNextAppOperation.mockResolvedValue(null);
    renewAppOperationLease.mockResolvedValue(true);
    finishAppOperationRecord.mockResolvedValue(acceptedOperation());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function options() {
    return {
      workerId: 'worker-1',
      now: () => now,
      leaseExpiresAt: () => leaseExpiresAt,
      deadlineAt: () => deadlineAt,
      recoverExpiredAppOperationRecord,
      claimNextAppOperation,
      renewAppOperationLease,
      finishAppOperationRecord,
      execute,
    };
  }

  it('recovers expired foreign operations before attempting a claim', async () => {
    recoverExpiredAppOperationRecord
      .mockResolvedValueOnce(acceptedOperation('failed'))
      .mockResolvedValueOnce(null);

    await runAppsWorkerOnce(options());

    expect(recoverExpiredAppOperationRecord).toHaveBeenCalledTimes(2);
    expect(recoverExpiredAppOperationRecord).toHaveBeenNthCalledWith(1, {
      currentWorkerId: 'worker-1',
      now,
    });
    expect(recoverExpiredAppOperationRecord.mock.invocationCallOrder.at(-1)).toBeLessThan(
      claimNextAppOperation.mock.invocationCallOrder[0] ?? Infinity
    );
  });

  it('returns idle when no operation can be claimed', async () => {
    const result = await runAppsWorkerOnce(options());

    expect(result).toEqual({ claimed: false });
    expect(execute).not.toHaveBeenCalled();
  });

  it('claims with a deadline, executes, and finishes with the ownership fence', async () => {
    claimNextAppOperation.mockResolvedValue(claimedOperation());
    execute.mockResolvedValue({ status: 'succeeded', result: { releaseId: 'release-1' } });

    const result = await runAppsWorkerOnce(options());

    expect(claimNextAppOperation).toHaveBeenCalledWith({
      workerId: 'worker-1',
      now,
      leaseExpiresAt,
      deadlineAt,
    });
    expect(execute).toHaveBeenCalledWith(claimedOperation());
    expect(finishAppOperationRecord).toHaveBeenCalledWith({
      operationId: 'op_1',
      workerId: 'worker-1',
      leaseGeneration: 1,
      status: 'succeeded',
      result: { releaseId: 'release-1' },
      error: undefined,
      now,
    });
    expect(result).toEqual({ claimed: true, operationId: 'op_1', status: 'succeeded' });
  });

  it('marks executor errors as failed with stable error details and the same fence', async () => {
    claimNextAppOperation.mockResolvedValue(claimedOperation());
    execute.mockRejectedValue(new Error('Build failed'));

    const result = await runAppsWorkerOnce(options());

    expect(finishAppOperationRecord).toHaveBeenCalledWith({
      operationId: 'op_1',
      workerId: 'worker-1',
      leaseGeneration: 1,
      status: 'failed',
      result: undefined,
      error: {
        code: 'LEGACY_EXECUTOR_FAILED',
        message: 'Build failed',
        retryable: false,
      },
      now,
    });
    expect(result).toEqual({ claimed: true, operationId: 'op_1', status: 'failed' });
  });

  it('renews a long-running operation on cadence and clears its timer after completion', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const execution = deferred<{
      status: 'succeeded';
      result: { releaseId: string };
    }>();
    claimNextAppOperation.mockResolvedValue(claimedOperation());
    execute.mockReturnValue(execution.promise);

    const run = runAppsWorkerOnce({
      ...options(),
      now: () => new Date(),
      leaseExpiresAt: (date: Date) => new Date(date.getTime() + 30_000),
    });
    await flushPromises();

    await vi.advanceTimersByTimeAsync(5_000);

    expect(renewAppOperationLease).toHaveBeenCalledWith({
      operationId: 'op_1',
      workerId: 'worker-1',
      leaseGeneration: 1,
      now: new Date('2026-07-31T05:00:05.000Z'),
      leaseExpiresAt: new Date('2026-07-31T05:00:35.000Z'),
    });

    execution.resolve({ status: 'succeeded', result: { releaseId: 'release-1' } });
    await run;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never overlaps lease renewal requests', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const execution = deferred<{ status: 'succeeded' }>();
    const firstRenewal = deferred<boolean>();
    claimNextAppOperation.mockResolvedValue(claimedOperation());
    execute.mockReturnValue(execution.promise);
    renewAppOperationLease.mockReturnValueOnce(firstRenewal.promise).mockResolvedValueOnce(true);

    const run = runAppsWorkerOnce({
      ...options(),
      now: () => new Date(),
      leaseExpiresAt: (date: Date) => new Date(date.getTime() + 30_000),
    });
    await flushPromises();

    await vi.advanceTimersByTimeAsync(15_000);
    expect(renewAppOperationLease).toHaveBeenCalledTimes(1);

    firstRenewal.resolve(true);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(renewAppOperationLease).toHaveBeenCalledTimes(2);

    execution.resolve({ status: 'succeeded' });
    await run;
  });

  it('retries after a transient renewal error', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const execution = deferred<{ status: 'succeeded' }>();
    claimNextAppOperation.mockResolvedValue(claimedOperation());
    execute.mockReturnValue(execution.promise);
    renewAppOperationLease.mockRejectedValueOnce(new Error('Mongo unavailable'));

    const run = runAppsWorkerOnce({
      ...options(),
      now: () => new Date(),
      leaseExpiresAt: (date: Date) => new Date(date.getTime() + 30_000),
    });
    await flushPromises();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(renewAppOperationLease).toHaveBeenCalledTimes(2);
    expect(mockLogWarn).toHaveBeenCalledWith(
      'Apps operation lease renewal failed; will retry',
      expect.objectContaining({ operationId: 'op_1', error: 'Mongo unavailable' })
    );
    execution.resolve({ status: 'succeeded' });
    await run;
  });

  it('surfaces definite lease loss after execution settles without writing a terminal result', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const execution = deferred<{ status: 'succeeded' }>();
    claimNextAppOperation.mockResolvedValue(claimedOperation());
    execute.mockReturnValue(execution.promise);
    renewAppOperationLease.mockResolvedValue(false);

    const run = runAppsWorkerOnce({
      ...options(),
      now: () => new Date(),
      leaseExpiresAt: (date: Date) => new Date(date.getTime() + 30_000),
    });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(5_000);
    execution.resolve({ status: 'succeeded' });

    await expect(run).rejects.toBeInstanceOf(AppOperationLeaseLostError);
    expect(finishAppOperationRecord).not.toHaveBeenCalled();
  });

  it('treats a zero-match terminal write as lease loss', async () => {
    claimNextAppOperation.mockResolvedValue(claimedOperation());
    execute.mockResolvedValue({ status: 'succeeded' });
    finishAppOperationRecord.mockResolvedValue(null);

    await expect(runAppsWorkerOnce(options())).rejects.toMatchObject({
      name: 'AppOperationLeaseLostError',
      message: APPS_OPERATION_LEASE_LOST_MESSAGE,
      operationId: 'op_1',
      workerId: 'worker-1',
      leaseGeneration: 1,
    });
  });
});

describe('startAppsWorkerRunner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops new claims and drains an in-flight operation', async () => {
    const execution = deferred<void>();
    const runOnce = vi.fn().mockImplementation(async (input) => {
      input.onCurrentOperationChange({ operationId: 'op_1', leaseGeneration: 2 });
      await execution.promise;
      input.onCurrentOperationChange(null);
      return { claimed: true, operationId: 'op_1', status: 'succeeded' as const };
    });
    const runner = startAppsWorkerRunner('worker-1', { runOnce });
    await flushPromises();

    expect(runner.getCurrentOperation()).toEqual({ operationId: 'op_1', leaseGeneration: 2 });
    runner.stopClaiming();
    const draining = runner.drain(1_000);
    await vi.advanceTimersByTimeAsync(500);
    execution.resolve();

    await expect(draining).resolves.toBe('drained');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(runOnce).toHaveBeenCalledTimes(1);
  });

  it('drains immediately when idle', async () => {
    const runOnce = vi.fn().mockResolvedValue({ claimed: false });
    const runner = startAppsWorkerRunner('worker-1', { runOnce });
    await flushPromises();
    runner.stopClaiming();

    await expect(runner.drain(1_000)).resolves.toBe('drained');
  });

  it('returns timed_out without completing or releasing an in-flight operation', async () => {
    const execution = deferred<void>();
    const runOnce = vi.fn().mockImplementation(async (input) => {
      input.onCurrentOperationChange({ operationId: 'op_1', leaseGeneration: 2 });
      await execution.promise;
      input.onCurrentOperationChange(null);
      return { claimed: true, operationId: 'op_1', status: 'succeeded' as const };
    });
    const runner = startAppsWorkerRunner('worker-1', { runOnce });
    await flushPromises();
    runner.stopClaiming();

    const draining = runner.drain(100);
    await vi.advanceTimersByTimeAsync(100);

    await expect(draining).resolves.toBe('timed_out');
    expect(runner.getCurrentOperation()).toEqual({ operationId: 'op_1', leaseGeneration: 2 });

    execution.resolve();
    await flushPromises();
  });

  it('reports a definite lease loss as a fatal runner error', async () => {
    const error = new AppOperationLeaseLostError('op_1', 'worker-1', 2);
    const runOnce = vi.fn().mockRejectedValue(error);
    const onFatal = vi.fn();
    const runner = startAppsWorkerRunner('worker-1', { runOnce, onFatal });
    await vi.advanceTimersByTimeAsync(0);

    expect(onFatal).toHaveBeenCalledWith(error);
    runner.stopClaiming();
  });
});
