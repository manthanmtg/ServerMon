/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCreate,
  mockFindOne,
  mockFindOneAndUpdate,
  mockUpdateOne,
  mockAppendAppOperationEvent,
  mockLogError,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFindOne: vi.fn(),
  mockFindOneAndUpdate: vi.fn(),
  mockUpdateOne: vi.fn(),
  mockAppendAppOperationEvent: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock('@/models/AppOperation', () => ({
  default: {
    create: mockCreate,
    findOne: mockFindOne,
    findOneAndUpdate: mockFindOneAndUpdate,
    updateOne: mockUpdateOne,
  },
}));

vi.mock('./operation-event-repository', () => ({
  appendAppOperationEvent: mockAppendAppOperationEvent,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: mockLogError, debug: vi.fn() }),
}));

import {
  ActiveAppOperationError,
  WORKER_INTERRUPTED_CODE,
  WORKER_INTERRUPTED_MESSAGE,
  claimNextAppOperation,
  createAppOperationRecord,
  findAppOperationByIdempotencyKey,
  finishAppOperationRecord,
  recoverExpiredAppOperationRecord,
  renewAppOperationLease,
} from './operation-repository';

const createdAt = new Date('2026-07-31T05:00:00.000Z');
const appId = '64f000000000000000000001';

function operationDoc(overrides: Record<string, unknown> = {}) {
  return {
    operationId: 'op_1',
    appId,
    appSlug: 'demo',
    type: 'deploy',
    status: 'queued',
    phase: 'queued',
    active: true,
    title: 'Deploy',
    createdAt,
    queuedAt: createdAt,
    lease: { generation: 0 },
    configSnapshot: {},
    ...overrides,
  };
}

describe('operation repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppendAppOperationEvent.mockResolvedValue(undefined);
  });

  it('creates a queued operation and appends a creation event', async () => {
    mockCreate.mockResolvedValue(operationDoc());

    const operation = await createAppOperationRecord({
      operationId: 'op_1',
      appId,
      appSlug: 'demo',
      type: 'deploy',
      title: 'Deploy',
      configSnapshot: {},
      requestedBy: { role: 'admin' },
      now: createdAt,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'op_1',
        status: 'queued',
        active: true,
        phase: 'queued',
        queuedAt: createdAt,
      })
    );
    expect(mockAppendAppOperationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'op_1',
        type: 'created',
        status: 'queued',
        phase: 'queued',
      })
    );
    expect(operation).toMatchObject({
      id: 'op_1',
      appId,
      status: 'queued',
      phase: 'queued',
      createdAt: '2026-07-31T05:00:00.000Z',
    });
  });

  it('maps the active-operation unique index to ActiveAppOperationError', async () => {
    const duplicate = Object.assign(new Error('duplicate'), {
      code: 11000,
      keyPattern: { appId: 1, active: 1 },
    });
    mockCreate.mockRejectedValue(duplicate);

    await expect(
      createAppOperationRecord({
        operationId: 'op_1',
        appId,
        appSlug: 'demo',
        type: 'deploy',
        title: 'Deploy',
        configSnapshot: {},
      })
    ).rejects.toBeInstanceOf(ActiveAppOperationError);
  });

  it('finds an existing operation by idempotency key', async () => {
    mockFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(operationDoc({ idempotencyKey: 'idem-1' })),
    });

    const operation = await findAppOperationByIdempotencyKey(appId, 'idem-1');

    expect(mockFindOne).toHaveBeenCalledWith({ appId, idempotencyKey: 'idem-1' });
    expect(operation?.id).toBe('op_1');
  });

  it('claims the oldest queued operation with a fenced lease', async () => {
    const now = new Date('2026-07-31T05:01:00.000Z');
    const leaseExpiresAt = new Date('2026-07-31T05:01:30.000Z');
    const deadlineAt = new Date('2026-07-31T06:01:00.000Z');
    mockFindOneAndUpdate.mockResolvedValue(
      operationDoc({
        status: 'running',
        phase: 'claiming',
        startedAt: now,
        deadlineAt,
        lease: { workerId: 'worker-1', generation: 1, expiresAt: leaseExpiresAt },
      })
    );

    const claimed = await claimNextAppOperation({
      workerId: 'worker-1',
      now,
      leaseExpiresAt,
      deadlineAt,
    });

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { status: 'queued', active: true },
      {
        $set: {
          status: 'running',
          phase: 'claiming',
          startedAt: now,
          deadlineAt,
          'lease.workerId': 'worker-1',
          'lease.expiresAt': leaseExpiresAt,
          'lease.renewedAt': now,
        },
        $inc: { attempts: 1, 'lease.generation': 1 },
      },
      { sort: { createdAt: 1, _id: 1 }, new: true, lean: true }
    );
    expect(claimed).toMatchObject({
      id: 'op_1',
      status: 'running',
      phase: 'claiming',
      workerId: 'worker-1',
      leaseGeneration: 1,
      deadlineAt: '2026-07-31T06:01:00.000Z',
    });
  });

  it('returns a claimed operation even when its auxiliary event cannot be appended', async () => {
    const claimedAt = new Date('2026-07-31T05:01:00.000Z');
    mockFindOneAndUpdate.mockResolvedValue(
      operationDoc({
        status: 'running',
        phase: 'claiming',
        startedAt: claimedAt,
        lease: { workerId: 'worker-1', generation: 1 },
      })
    );
    mockAppendAppOperationEvent.mockRejectedValue(new Error('event store unavailable'));

    const claimed = await claimNextAppOperation({
      workerId: 'worker-1',
      now: claimedAt,
      leaseExpiresAt: new Date('2026-07-31T05:01:30.000Z'),
      deadlineAt: new Date('2026-07-31T06:01:00.000Z'),
    });

    expect(claimed?.id).toBe('op_1');
    expect(mockLogError).toHaveBeenCalledWith(
      'Failed to append claimed Apps operation event',
      expect.objectContaining({ operationId: 'op_1', error: 'event store unavailable' })
    );
  });

  it('renews a lease only when worker and generation match', async () => {
    const leaseExpiresAt = new Date('2026-07-31T05:02:00.000Z');
    const now = new Date('2026-07-31T05:01:30.000Z');
    mockUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 0 });

    const renewed = await renewAppOperationLease({
      operationId: 'op_1',
      workerId: 'worker-1',
      leaseGeneration: 2,
      leaseExpiresAt,
      now,
    });

    expect(mockUpdateOne).toHaveBeenCalledWith(
      {
        operationId: 'op_1',
        active: true,
        status: { $in: ['running', 'cancel_requested'] },
        'lease.workerId': 'worker-1',
        'lease.generation': 2,
      },
      {
        $set: {
          'lease.expiresAt': leaseExpiresAt,
          'lease.renewedAt': now,
        },
      }
    );
    expect(renewed).toBe(true);
  });

  it('reports lease loss only when the renewal fence matches no operation', async () => {
    mockUpdateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

    await expect(
      renewAppOperationLease({
        operationId: 'op_1',
        workerId: 'worker-1',
        leaseGeneration: 2,
        leaseExpiresAt: new Date('2026-07-31T05:02:00.000Z'),
        now: new Date('2026-07-31T05:01:30.000Z'),
      })
    ).resolves.toBe(false);
  });

  it('finishes an active operation and clears the active lock', async () => {
    const completedAt = new Date('2026-07-31T05:03:00.000Z');
    mockFindOneAndUpdate.mockResolvedValue(
      operationDoc({
        status: 'succeeded',
        phase: 'terminal',
        active: false,
        completedAt,
      })
    );

    const finished = await finishAppOperationRecord({
      operationId: 'op_1',
      workerId: 'worker-1',
      leaseGeneration: 3,
      status: 'succeeded',
      result: { releaseId: 'release-1' },
      now: completedAt,
    });

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      {
        operationId: 'op_1',
        active: true,
        status: { $in: ['running', 'cancel_requested'] },
        'lease.workerId': 'worker-1',
        'lease.generation': 3,
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'succeeded',
          phase: 'terminal',
          active: false,
          completedAt,
        }),
      }),
      { new: true, lean: true }
    );
    expect(finished?.status).toBe('succeeded');
  });

  it('does not append a terminal event when the finish fence no longer matches', async () => {
    mockFindOneAndUpdate.mockResolvedValue(null);

    const finished = await finishAppOperationRecord({
      operationId: 'op_1',
      workerId: 'obsolete-worker',
      leaseGeneration: 1,
      status: 'succeeded',
      now: new Date('2026-07-31T05:03:00.000Z'),
    });

    expect(finished).toBeNull();
    expect(mockAppendAppOperationEvent).not.toHaveBeenCalled();
  });

  it('atomically fails one expired operation owned by a different worker', async () => {
    const now = new Date('2026-07-31T05:04:00.000Z');
    const staleStartedBefore = new Date('2026-07-31T05:03:30.000Z');
    mockFindOneAndUpdate.mockResolvedValue(
      operationDoc({
        status: 'failed',
        phase: 'terminal',
        active: false,
        completedAt: now,
        lease: { workerId: 'old-worker', generation: 4 },
        error: {
          code: WORKER_INTERRUPTED_CODE,
          message: WORKER_INTERRUPTED_MESSAGE,
          retryable: false,
          details: { previousWorkerId: 'old-worker', leaseGeneration: 4 },
        },
      })
    );

    const recovered = await recoverExpiredAppOperationRecord({
      currentWorkerId: 'new-worker',
      now,
    });

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      {
        active: true,
        status: { $in: ['running', 'cancel_requested'] },
        'lease.workerId': { $ne: 'new-worker' },
        $or: [
          { 'lease.expiresAt': { $lte: now } },
          {
            'lease.expiresAt': { $exists: false },
            startedAt: { $lte: staleStartedBefore },
          },
        ],
      },
      [
        {
          $set: {
            status: 'failed',
            phase: 'terminal',
            active: false,
            completedAt: now,
            error: {
              code: WORKER_INTERRUPTED_CODE,
              message: WORKER_INTERRUPTED_MESSAGE,
              retryable: false,
              details: {
                previousWorkerId: '$lease.workerId',
                leaseGeneration: '$lease.generation',
              },
            },
          },
        },
      ],
      {
        sort: { 'lease.expiresAt': 1, startedAt: 1, _id: 1 },
        new: true,
        lean: true,
        updatePipeline: true,
      }
    );
    expect(mockAppendAppOperationEvent).toHaveBeenCalledWith({
      operationId: 'op_1',
      appId,
      type: 'error',
      status: 'failed',
      phase: 'terminal',
      message: WORKER_INTERRUPTED_MESSAGE,
      details: {
        code: WORKER_INTERRUPTED_CODE,
        previousWorkerId: 'old-worker',
        leaseGeneration: 4,
      },
    });
    expect(recovered).toMatchObject({
      id: 'op_1',
      status: 'failed',
      phase: 'terminal',
      error: WORKER_INTERRUPTED_MESSAGE,
    });
  });

  it('leaves terminal and unexpired operations unchanged when recovery finds no match', async () => {
    mockFindOneAndUpdate.mockResolvedValue(null);

    const recovered = await recoverExpiredAppOperationRecord({
      currentWorkerId: 'new-worker',
      now: new Date('2026-07-31T05:04:00.000Z'),
    });

    expect(recovered).toBeNull();
    expect(mockAppendAppOperationEvent).not.toHaveBeenCalled();
  });

  it('keeps a recovered operation terminal when its observability event cannot be appended', async () => {
    const now = new Date('2026-07-31T05:04:00.000Z');
    mockFindOneAndUpdate.mockResolvedValue(
      operationDoc({
        status: 'failed',
        phase: 'terminal',
        active: false,
        completedAt: now,
        lease: { workerId: 'old-worker', generation: 4 },
        error: { message: WORKER_INTERRUPTED_MESSAGE },
      })
    );
    mockAppendAppOperationEvent.mockRejectedValue(new Error('event store unavailable'));

    const recovered = await recoverExpiredAppOperationRecord({
      currentWorkerId: 'new-worker',
      now,
    });

    expect(recovered?.status).toBe('failed');
    expect(mockFindOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(mockLogError).toHaveBeenCalledWith(
      'Failed to append recovered Apps operation event',
      expect.objectContaining({ operationId: 'op_1', error: 'event store unavailable' })
    );
  });
});
