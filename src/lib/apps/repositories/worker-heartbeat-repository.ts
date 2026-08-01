import AppsWorkerHeartbeat, { AppsWorkerHeartbeatStatus } from '@/models/AppsWorkerHeartbeat';
import { APPS_WORKER_OFFLINE_MS } from '../config';

interface UpsertAppsWorkerHeartbeatInput {
  workerId: string;
  status: AppsWorkerHeartbeatStatus;
  hostname: string;
  pid: number;
  version?: string;
  currentOperationId?: string;
  leaseGeneration?: number;
  now?: Date;
  error?: string;
}

interface AppsWorkerAvailabilityRecord {
  workerId: string;
  status: AppsWorkerHeartbeatStatus;
  lastSeenAt: Date;
}

export type AppsWorkerAvailability =
  | {
      available: true;
      reason: 'healthy';
      workerId: string;
      lastSeenAt: Date;
    }
  | {
      available: false;
      reason: 'missing' | 'stale' | 'not_running';
      workerId?: string;
      lastSeenAt?: Date;
    };

export async function getAppsWorkerAvailability({
  now = new Date(),
}: { now?: Date } = {}): Promise<AppsWorkerAvailability> {
  const record = (await AppsWorkerHeartbeat.findOne({})
    .sort({ lastSeenAt: -1 })
    .lean()) as AppsWorkerAvailabilityRecord | null;

  if (!record) return { available: false, reason: 'missing' };

  const summary = {
    workerId: record.workerId,
    lastSeenAt: record.lastSeenAt,
  };
  if (record.status !== 'running') {
    return { available: false, reason: 'not_running', ...summary };
  }

  const oldestHealthyHeartbeat = now.getTime() - APPS_WORKER_OFFLINE_MS;
  if (record.lastSeenAt.getTime() < oldestHealthyHeartbeat) {
    return { available: false, reason: 'stale', ...summary };
  }

  return { available: true, reason: 'healthy', ...summary };
}

export async function upsertAppsWorkerHeartbeat(
  input: UpsertAppsWorkerHeartbeatInput
): Promise<void> {
  const now = input.now ?? new Date();
  const set: Record<string, unknown> = {
    status: input.status,
    hostname: input.hostname,
    pid: input.pid,
    version: input.version,
    lastSeenAt: now,
  };
  const unset: Record<string, 1> = {};

  if (input.currentOperationId === undefined) unset.currentOperationId = 1;
  else set.currentOperationId = input.currentOperationId;
  if (input.leaseGeneration === undefined) unset.leaseGeneration = 1;
  else set.leaseGeneration = input.leaseGeneration;
  if (input.error === undefined) unset.error = 1;
  else set.error = input.error;

  const allowedCurrentStatuses: Record<AppsWorkerHeartbeatStatus, AppsWorkerHeartbeatStatus[]> = {
    starting: [],
    running: ['starting', 'running'],
    draining: ['starting', 'running', 'draining'],
    stopped: [],
    failed: ['starting', 'running', 'draining', 'failed'],
  };
  const isInitialHeartbeat = input.status === 'starting';
  const filter = isInitialHeartbeat
    ? { workerId: input.workerId }
    : {
        workerId: input.workerId,
        status: { $in: allowedCurrentStatuses[input.status] },
      };

  await AppsWorkerHeartbeat.findOneAndUpdate(
    filter,
    {
      $set: set,
      $unset: unset,
      $setOnInsert: {
        startedAt: now,
      },
    },
    { upsert: isInitialHeartbeat, new: true }
  );
}

export async function markAppsWorkerStopped(workerId: string, now = new Date()): Promise<void> {
  await AppsWorkerHeartbeat.findOneAndUpdate(
    {
      workerId,
      status: { $in: ['starting', 'running', 'draining', 'stopped'] },
    },
    {
      $set: {
        status: 'stopped',
        lastSeenAt: now,
        stoppedAt: now,
      },
      $unset: {
        currentOperationId: 1,
        leaseGeneration: 1,
        error: 1,
      },
    }
  );
}
