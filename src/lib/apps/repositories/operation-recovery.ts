import os from 'node:os';
import { createLogger } from '@/lib/logger';
import AppOperation from '@/models/AppOperation';
import AppsWorkerHeartbeat from '@/models/AppsWorkerHeartbeat';
import { isProcessGroupDead } from '../process-evidence';
import { releaseAppOperationLock } from './operation-repository';

const log = createLogger('apps:operation-recovery');

interface RecoveryRecord {
  operationId: string;
  appId: { toString: () => string };
  lease?: {
    workerId?: string;
    spawnPending?: boolean;
    processes?: Array<{ pid: number; startTime?: string }>;
  };
  error?: {
    code?: string;
  };
}

interface AutoReleaseAppOperationLockInput {
  operationId: string;
  now?: Date;
}

/**
 * Lists operations whose lock is still held in the recovery-required state.
 * recoverExpiredAppOperationRecord() never re-selects a record it (or a
 * previous worker) already marked RECOVERY_REQUIRED, so these must be swept
 * separately — otherwise a lock marked before a worker restart can never be
 * auto-released.
 */
export async function findRecoveryRequiredOperations(
  limit: number
): Promise<Array<{ operationId: string }>> {
  const records = (await AppOperation.find({
    active: true,
    'error.code': 'RECOVERY_REQUIRED',
  })
    .sort({ queuedAt: 1, _id: 1 })
    .limit(limit)
    .lean()) as RecoveryRecord[];
  return records.map((record) => ({ operationId: record.operationId }));
}

/**
 * Releases a RECOVERY_REQUIRED lock only when host-local evidence proves the
 * previous worker's detached processes have stopped: the recorded worker ran
 * on this host, no spawn was left untracked, and every tracked process group
 * is verifiably dead. Any doubt keeps the lock for manual recovery.
 */
export async function autoReleaseAppOperationLock({
  operationId,
  now = new Date(),
}: AutoReleaseAppOperationLockInput): Promise<boolean> {
  const record = (await AppOperation.findOne({
    operationId,
    active: true,
    'error.code': 'RECOVERY_REQUIRED',
  }).lean()) as RecoveryRecord | null;
  if (!record) return false;

  const workerId = record.lease?.workerId;
  if (!workerId) return false;

  const heartbeat = (await AppsWorkerHeartbeat.findOne({ workerId }).lean()) as {
    hostname?: string;
  } | null;
  if (!heartbeat || heartbeat.hostname !== os.hostname()) {
    log.info('Recovery lock kept: previous worker ran on another host', {
      operationId,
      workerId,
    });
    return false;
  }

  const spawnPending = record.lease?.spawnPending === true;
  const processes = record.lease?.processes ?? [];
  if (spawnPending && processes.length === 0) {
    log.info('Recovery lock kept: a command spawn may not have been tracked', {
      operationId,
      workerId,
    });
    return false;
  }

  for (const process of processes) {
    if (!isProcessGroupDead(process.pid, process.startTime)) {
      log.warn('Recovery lock kept: tracked process group is still alive', {
        operationId,
        workerId,
        pid: process.pid,
      });
      return false;
    }
  }

  const released = await releaseAppOperationLock({
    operationId,
    reason: 'Recorded process groups verified stopped on the worker host',
    releasedBy: 'recovery',
    now,
  });
  if (!released) return false;

  log.info('Recovery lock auto-released with process evidence', {
    operationId,
    workerId,
  });
  return true;
}
