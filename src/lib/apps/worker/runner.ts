import { createLogger } from '@/lib/logger';
import {
  appsOperationDeadlineAt,
  appsOperationLeaseExpiresAt,
  APPS_OPERATION_LEASE_RENEW_MS,
  APPS_WORKER_POLL_MS,
} from '../config';
import {
  claimNextAppOperation,
  ClaimedAppOperation,
  finishAppOperationRecord,
  recoverExpiredAppOperationRecord,
  renewAppOperationLease,
} from '../repositories/operation-repository';
import { executeLegacyAppOperation } from './legacy-executor';

const log = createLogger('apps:worker:runner');
const RECOVERY_BATCH_LIMIT = 25;
export const APPS_OPERATION_LEASE_LOST_MESSAGE = 'Apps worker lost operation lease ownership';

export interface AppOperationExecutorResult {
  status: 'succeeded' | 'failed' | 'cancelled' | 'unchanged';
  result?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
}

export interface CurrentAppOperation {
  operationId: string;
  leaseGeneration: number;
}

export class AppOperationLeaseLostError extends Error {
  constructor(
    readonly operationId: string,
    readonly workerId: string,
    readonly leaseGeneration: number
  ) {
    super(APPS_OPERATION_LEASE_LOST_MESSAGE);
    this.name = 'AppOperationLeaseLostError';
  }
}

export interface RunAppsWorkerOnceOptions {
  workerId: string;
  now?: () => Date;
  leaseExpiresAt?: (now: Date) => Date;
  deadlineAt?: (now: Date) => Date;
  renewIntervalMs?: number;
  recoveryBatchLimit?: number;
  recoverExpiredAppOperationRecord?: typeof recoverExpiredAppOperationRecord;
  claimNextAppOperation?: typeof claimNextAppOperation;
  renewAppOperationLease?: typeof renewAppOperationLease;
  finishAppOperationRecord?: typeof finishAppOperationRecord;
  execute?: (operation: ClaimedAppOperation) => Promise<AppOperationExecutorResult>;
  onCurrentOperationChange?: (operation: CurrentAppOperation | null) => void;
}

export type RunAppsWorkerOnceResult =
  | { claimed: false }
  | { claimed: true; operationId: string; status: AppOperationExecutorResult['status'] };

export async function runAppsWorkerOnce({
  workerId,
  now = () => new Date(),
  leaseExpiresAt = appsOperationLeaseExpiresAt,
  deadlineAt = appsOperationDeadlineAt,
  renewIntervalMs = APPS_OPERATION_LEASE_RENEW_MS,
  recoveryBatchLimit = RECOVERY_BATCH_LIMIT,
  recoverExpiredAppOperationRecord: recover = recoverExpiredAppOperationRecord,
  claimNextAppOperation: claim = claimNextAppOperation,
  renewAppOperationLease: renew = renewAppOperationLease,
  finishAppOperationRecord: finish = finishAppOperationRecord,
  execute = executeLegacyAppOperation,
  onCurrentOperationChange,
}: RunAppsWorkerOnceOptions): Promise<RunAppsWorkerOnceResult> {
  for (let recoveredCount = 0; recoveredCount < recoveryBatchLimit; recoveredCount += 1) {
    const recovered = await recover({ currentWorkerId: workerId, now: now() });
    if (!recovered) break;
  }

  const startedAt = now();
  const operation = await claim({
    workerId,
    now: startedAt,
    leaseExpiresAt: leaseExpiresAt(startedAt),
    deadlineAt: deadlineAt(startedAt),
  });

  if (!operation) return { claimed: false };

  const currentOperation = {
    operationId: operation.id,
    leaseGeneration: operation.leaseGeneration,
  };
  onCurrentOperationChange?.(currentOperation);

  let leaseLost = false;
  let renewalInFlight: Promise<void> | null = null;

  const renewLease = () => {
    if (leaseLost || renewalInFlight) return;
    const renewedAt = now();
    renewalInFlight = (async () => {
      try {
        const renewed = await renew({
          operationId: operation.id,
          workerId,
          leaseGeneration: operation.leaseGeneration,
          now: renewedAt,
          leaseExpiresAt: leaseExpiresAt(renewedAt),
        });
        if (!renewed) {
          leaseLost = true;
          log.warn('Apps operation lease was lost', {
            operationId: operation.id,
            workerId,
            leaseGeneration: operation.leaseGeneration,
          });
        }
      } catch (error: unknown) {
        log.warn('Apps operation lease renewal failed; will retry', {
          operationId: operation.id,
          workerId,
          leaseGeneration: operation.leaseGeneration,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        renewalInFlight = null;
      }
    })();
  };

  const renewalTimer = setInterval(renewLease, renewIntervalMs);

  try {
    let result: AppOperationExecutorResult;
    try {
      result = await execute(operation);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Apps worker operation failed';
      log.error('Apps worker operation failed', { operationId: operation.id, error: message });
      result = {
        status: 'failed',
        error: {
          code: 'LEGACY_EXECUTOR_FAILED',
          message,
          retryable: false,
        },
      };
    }

    clearInterval(renewalTimer);
    const pendingRenewal = renewalInFlight;
    if (pendingRenewal) await pendingRenewal;

    if (leaseLost) {
      throw new AppOperationLeaseLostError(operation.id, workerId, operation.leaseGeneration);
    }

    const finished = await finish({
      operationId: operation.id,
      workerId,
      leaseGeneration: operation.leaseGeneration,
      status: result.status,
      result: result.result,
      error: result.error,
      now: now(),
    });
    if (!finished) {
      throw new AppOperationLeaseLostError(operation.id, workerId, operation.leaseGeneration);
    }

    return { claimed: true, operationId: operation.id, status: result.status };
  } finally {
    clearInterval(renewalTimer);
    const pendingRenewal = renewalInFlight;
    if (pendingRenewal) await pendingRenewal;
    onCurrentOperationChange?.(null);
  }
}

export interface AppsWorkerRunnerHandle {
  stopClaiming(): void;
  drain(timeoutMs: number): Promise<'drained' | 'timed_out'>;
  getCurrentOperation(): CurrentAppOperation | null;
}

export interface StartAppsWorkerRunnerOptions {
  pollMs?: number;
  runOnce?: typeof runAppsWorkerOnce;
  onFatal?: (error: AppOperationLeaseLostError) => void;
}

export function startAppsWorkerRunner(
  workerId: string,
  {
    pollMs = APPS_WORKER_POLL_MS,
    runOnce = runAppsWorkerOnce,
    onFatal,
  }: StartAppsWorkerRunnerOptions = {}
): AppsWorkerRunnerHandle {
  let acceptingClaims = true;
  let currentOperation: CurrentAppOperation | null = null;
  let inFlight: Promise<void> | null = null;

  const stopClaiming = () => {
    if (!acceptingClaims) return;
    acceptingClaims = false;
    clearInterval(pollTimer);
  };

  const tick = () => {
    if (!acceptingClaims || inFlight) return;

    const tracked = Promise.resolve()
      .then(() =>
        runOnce({
          workerId,
          onCurrentOperationChange: (operation) => {
            currentOperation = operation;
          },
        })
      )
      .then(() => undefined)
      .catch((error: unknown) => {
        if (error instanceof AppOperationLeaseLostError) {
          stopClaiming();
          onFatal?.(error);
          return;
        }
        log.error('Apps worker tick failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        inFlight = null;
      });
    inFlight = tracked;
  };

  const pollTimer = setInterval(tick, pollMs);
  tick();

  return {
    stopClaiming,
    async drain(timeoutMs) {
      const operation = inFlight;
      if (!operation) return 'drained';

      let timeout: ReturnType<typeof setTimeout> | undefined;
      const result = await Promise.race([
        operation.then(() => 'drained' as const),
        new Promise<'timed_out'>((resolve) => {
          timeout = setTimeout(() => resolve('timed_out'), timeoutMs);
        }),
      ]);
      if (timeout) clearTimeout(timeout);
      return result;
    },
    getCurrentOperation: () => currentOperation,
  };
}
