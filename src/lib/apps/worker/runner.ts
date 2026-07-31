import { createLogger } from '@/lib/logger';
import { appsOperationLeaseExpiresAt, APPS_WORKER_POLL_MS } from '../config';
import {
  claimNextAppOperation,
  ClaimedAppOperation,
  finishAppOperationRecord,
} from '../repositories/operation-repository';
import { executeLegacyAppOperation } from './legacy-executor';

const log = createLogger('apps:worker:runner');

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

interface RunAppsWorkerOnceOptions {
  workerId: string;
  now?: () => Date;
  leaseExpiresAt?: (now: Date) => Date;
  claimNextAppOperation?: typeof claimNextAppOperation;
  finishAppOperationRecord?: typeof finishAppOperationRecord;
  execute?: (operation: ClaimedAppOperation) => Promise<AppOperationExecutorResult>;
}

export type RunAppsWorkerOnceResult =
  | { claimed: false }
  | { claimed: true; operationId: string; status: AppOperationExecutorResult['status'] };

export async function runAppsWorkerOnce({
  workerId,
  now = () => new Date(),
  leaseExpiresAt = appsOperationLeaseExpiresAt,
  claimNextAppOperation: claim = claimNextAppOperation,
  finishAppOperationRecord: finish = finishAppOperationRecord,
  execute = executeLegacyAppOperation,
}: RunAppsWorkerOnceOptions): Promise<RunAppsWorkerOnceResult> {
  const startedAt = now();
  const operation = await claim({
    workerId,
    now: startedAt,
    leaseExpiresAt: leaseExpiresAt(startedAt),
  });

  if (!operation) return { claimed: false };

  try {
    const result = await execute(operation);
    await finish({
      operationId: operation.id,
      status: result.status,
      result: result.result,
      error: result.error,
      now: now(),
    });
    return { claimed: true, operationId: operation.id, status: result.status };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Apps worker operation failed';
    log.error('Apps worker operation failed', { operationId: operation.id, error: message });
    await finish({
      operationId: operation.id,
      status: 'failed',
      error: {
        code: 'LEGACY_EXECUTOR_FAILED',
        message,
        retryable: false,
      },
      now: now(),
    });
    return { claimed: true, operationId: operation.id, status: 'failed' };
  }
}

export interface AppsWorkerRunnerHandle {
  stop: () => void;
}

export function startAppsWorkerRunner(workerId: string): AppsWorkerRunnerHandle {
  let tickInFlight = false;
  const tick = async () => {
    if (tickInFlight) return;
    tickInFlight = true;
    try {
      await runAppsWorkerOnce({ workerId });
    } catch (error) {
      log.error('Apps worker tick failed', { error });
    } finally {
      tickInFlight = false;
    }
  };

  const interval = setInterval(() => {
    void tick();
  }, APPS_WORKER_POLL_MS);
  void tick();

  return {
    stop: () => clearInterval(interval),
  };
}
