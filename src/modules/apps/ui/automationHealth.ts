import type { AppsAutomationHealth } from '../types';

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function dateString(value: unknown): string | undefined {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : undefined;
}

export function readAutomationHealth(payload: unknown): AppsAutomationHealth | undefined {
  if (!record(payload) || !record(payload.health)) return undefined;
  const { worker, scheduler, serverTime } = payload.health;
  if (!record(worker) || !record(scheduler) || !dateString(serverTime)) return undefined;
  const workerStatus = worker.status;
  const schedulerStatus = scheduler.status;
  if (
    workerStatus !== 'healthy' &&
    workerStatus !== 'missing' &&
    workerStatus !== 'stale' &&
    workerStatus !== 'not_running'
  )
    return undefined;
  if (
    schedulerStatus !== 'healthy' &&
    schedulerStatus !== 'starting' &&
    schedulerStatus !== 'stale' &&
    schedulerStatus !== 'error' &&
    schedulerStatus !== 'unavailable'
  )
    return undefined;
  return {
    serverTime: serverTime as string,
    worker: {
      status: workerStatus,
      lastSeenAt: dateString(worker.lastSeenAt),
    },
    scheduler: {
      status: schedulerStatus,
      lastScanStartedAt: dateString(scheduler.lastScanStartedAt),
      lastScanCompletedAt: dateString(scheduler.lastScanCompletedAt),
      lastSuccessfulScanAt: dateString(scheduler.lastSuccessfulScanAt),
      lastError: typeof scheduler.lastError === 'string' ? scheduler.lastError : undefined,
    },
  };
}
