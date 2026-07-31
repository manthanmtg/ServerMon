/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCreate,
  mockFindOne,
  mockFindOneAndUpdate,
  mockUpdateOne,
  mockAppendAppOperationEvent,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFindOne: vi.fn(),
  mockFindOneAndUpdate: vi.fn(),
  mockUpdateOne: vi.fn(),
  mockAppendAppOperationEvent: vi.fn(),
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

import {
  ActiveAppOperationError,
  claimNextAppOperation,
  createAppOperationRecord,
  findAppOperationByIdempotencyKey,
  finishAppOperationRecord,
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
    mockFindOneAndUpdate.mockResolvedValue(
      operationDoc({
        status: 'running',
        phase: 'claiming',
        startedAt: now,
        lease: { workerId: 'worker-1', generation: 1, expiresAt: leaseExpiresAt },
      })
    );

    const claimed = await claimNextAppOperation({
      workerId: 'worker-1',
      now,
      leaseExpiresAt,
    });

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { status: 'queued', active: true },
      {
        $set: {
          status: 'running',
          phase: 'claiming',
          startedAt: now,
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
    });
  });

  it('renews a lease only when worker and generation match', async () => {
    const leaseExpiresAt = new Date('2026-07-31T05:02:00.000Z');
    const now = new Date('2026-07-31T05:01:30.000Z');
    mockUpdateOne.mockResolvedValue({ modifiedCount: 1 });

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
        status: 'running',
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
      status: 'succeeded',
      result: { releaseId: 'release-1' },
      now: completedAt,
    });

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { operationId: 'op_1', active: true, status: { $in: ['running', 'cancel_requested'] } },
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
});
