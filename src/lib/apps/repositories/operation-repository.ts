import AppOperation from '@/models/AppOperation';
import type {
  AcceptedAppOperation,
  AppOperationType,
  AppV2OperationPhase,
  AppV2OperationStatus,
} from '@/modules/apps/types';
import { appendAppOperationEvent } from './operation-event-repository';

export class ActiveAppOperationError extends Error {
  constructor(readonly appId: string) {
    super(`An app operation is already active for app ${appId}`);
    this.name = 'ActiveAppOperationError';
  }
}

interface RequestedBy {
  userId?: string;
  username?: string;
  role?: string;
}

interface CreateAppOperationRecordInput {
  operationId: string;
  appId: string;
  appSlug: string;
  type: AppOperationType;
  title: string;
  configSnapshot: Record<string, unknown>;
  requestedBy?: RequestedBy;
  idempotencyKey?: string;
  targetReleaseId?: string;
  now?: Date;
}

interface ClaimNextAppOperationInput {
  workerId: string;
  now: Date;
  leaseExpiresAt: Date;
}

interface RenewAppOperationLeaseInput {
  operationId: string;
  workerId: string;
  leaseGeneration: number;
  leaseExpiresAt: Date;
  now: Date;
}

interface FinishAppOperationRecordInput {
  operationId: string;
  status: Extract<AppV2OperationStatus, 'succeeded' | 'failed' | 'cancelled' | 'unchanged'>;
  result?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
  now: Date;
}

interface OperationRecord {
  operationId: string;
  appId: { toString: () => string } | string;
  appSlug: string;
  type: AppOperationType;
  status: AppV2OperationStatus;
  phase: AppV2OperationPhase;
  createdAt?: Date;
  queuedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  lease?: {
    workerId?: string;
    generation?: number;
  };
  targetReleaseId?: string;
  configSnapshot?: Record<string, unknown>;
  error?: {
    message?: string;
  };
}

export interface ClaimedAppOperation extends AcceptedAppOperation {
  appSlug: string;
  leaseGeneration: number;
  targetReleaseId?: string;
  configSnapshot: Record<string, unknown>;
}

function operationCreatedAt(record: OperationRecord): string {
  return (record.createdAt ?? record.queuedAt ?? new Date()).toISOString();
}

function toAcceptedOperation(record: OperationRecord): AcceptedAppOperation {
  return {
    id: record.operationId,
    appId: record.appId.toString(),
    type: record.type,
    status: record.status,
    phase: record.phase,
    createdAt: operationCreatedAt(record),
    startedAt: record.startedAt?.toISOString(),
    completedAt: record.completedAt?.toISOString(),
    workerId: record.lease?.workerId,
    error: record.error?.message,
  };
}

function toClaimedOperation(record: OperationRecord): ClaimedAppOperation {
  return {
    ...toAcceptedOperation(record),
    appSlug: record.appSlug,
    leaseGeneration: record.lease?.generation ?? 0,
    targetReleaseId: record.targetReleaseId,
    configSnapshot: record.configSnapshot ?? {},
  };
}

function isDuplicateKeyError(error: unknown): error is { code: number; keyPattern?: unknown } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

function duplicateKeyIncludes(error: { keyPattern?: unknown }, key: string): boolean {
  return (
    typeof error.keyPattern === 'object' &&
    error.keyPattern !== null &&
    Object.prototype.hasOwnProperty.call(error.keyPattern, key)
  );
}

export async function createAppOperationRecord(
  input: CreateAppOperationRecordInput
): Promise<AcceptedAppOperation> {
  const now = input.now ?? new Date();
  try {
    const created = (await AppOperation.create({
      operationId: input.operationId,
      appId: input.appId,
      appSlug: input.appSlug,
      type: input.type,
      status: 'queued',
      active: true,
      phase: 'queued',
      title: input.title,
      requestedBy: input.requestedBy,
      idempotencyKey: input.idempotencyKey,
      targetReleaseId: input.targetReleaseId,
      configSnapshot: input.configSnapshot,
      queuedAt: now,
    })) as OperationRecord;

    await appendAppOperationEvent({
      operationId: created.operationId,
      appId: created.appId.toString(),
      type: 'created',
      status: 'queued',
      phase: 'queued',
      message: `${input.title} queued`,
    });

    return toAcceptedOperation(created);
  } catch (error: unknown) {
    if (isDuplicateKeyError(error) && duplicateKeyIncludes(error, 'active')) {
      throw new ActiveAppOperationError(input.appId);
    }
    throw error;
  }
}

export async function findAppOperationByIdempotencyKey(
  appId: string,
  idempotencyKey: string
): Promise<AcceptedAppOperation | null> {
  const record = (await AppOperation.findOne({
    appId,
    idempotencyKey,
  }).lean()) as OperationRecord | null;
  return record ? toAcceptedOperation(record) : null;
}

export async function findAppOperationById(
  operationId: string
): Promise<AcceptedAppOperation | null> {
  const record = (await AppOperation.findOne({ operationId }).lean()) as OperationRecord | null;
  return record ? toAcceptedOperation(record) : null;
}

export async function claimNextAppOperation(
  input: ClaimNextAppOperationInput
): Promise<ClaimedAppOperation | null> {
  const record = (await AppOperation.findOneAndUpdate(
    { status: 'queued', active: true },
    {
      $set: {
        status: 'running',
        phase: 'claiming',
        startedAt: input.now,
        'lease.workerId': input.workerId,
        'lease.expiresAt': input.leaseExpiresAt,
        'lease.renewedAt': input.now,
      },
      $inc: { attempts: 1, 'lease.generation': 1 },
    },
    { sort: { createdAt: 1, _id: 1 }, new: true, lean: true }
  )) as OperationRecord | null;

  if (!record) return null;
  await appendAppOperationEvent({
    operationId: record.operationId,
    appId: record.appId.toString(),
    type: 'status',
    status: 'running',
    phase: 'claiming',
    message: 'Operation claimed by Apps worker',
  });
  return toClaimedOperation(record);
}

export async function renewAppOperationLease(input: RenewAppOperationLeaseInput): Promise<boolean> {
  const result = await AppOperation.updateOne(
    {
      operationId: input.operationId,
      status: 'running',
      'lease.workerId': input.workerId,
      'lease.generation': input.leaseGeneration,
    },
    {
      $set: {
        'lease.expiresAt': input.leaseExpiresAt,
        'lease.renewedAt': input.now,
      },
    }
  );

  return result.modifiedCount === 1;
}

export async function finishAppOperationRecord(
  input: FinishAppOperationRecordInput
): Promise<AcceptedAppOperation | null> {
  const record = (await AppOperation.findOneAndUpdate(
    {
      operationId: input.operationId,
      active: true,
      status: { $in: ['running', 'cancel_requested'] },
    },
    {
      $set: {
        status: input.status,
        phase: 'terminal',
        active: false,
        completedAt: input.now,
        result: input.result,
        error: input.error,
      },
    },
    { new: true, lean: true }
  )) as OperationRecord | null;

  if (!record) return null;
  await appendAppOperationEvent({
    operationId: record.operationId,
    appId: record.appId.toString(),
    type: input.status === 'failed' ? 'error' : 'status',
    status: input.status,
    phase: 'terminal',
    message: input.error?.message ?? `Operation ${input.status}`,
    details: input.result,
  });
  return toAcceptedOperation(record);
}
