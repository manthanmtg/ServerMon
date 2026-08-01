export const APPS_OPERATION_LEASE_MS = 30_000;
export const APPS_OPERATION_LEASE_RENEW_MS = 5_000;
export const APPS_WORKER_HEARTBEAT_MS = 5_000;
export const APPS_WORKER_HEARTBEAT_WRITE_TIMEOUT_MS = 5_000;
export const APPS_WORKER_OFFLINE_MS = 20_000;
export const APPS_WORKER_POLL_MS = 1_000;
export const APPS_WORKER_DRAIN_MS = 30_000;
export const APPS_WORKER_STOP_TIMEOUT_MS = 45_000;
export const APPS_OPERATION_DEADLINE_MS = 60 * 60 * 1_000;
export const APPS_OPERATION_EVENT_RETENTION_DAYS = 90;

function assertPositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
}

export function validateAppsWorkerTimingConfig(): void {
  const timings = {
    APPS_OPERATION_LEASE_MS,
    APPS_OPERATION_LEASE_RENEW_MS,
    APPS_WORKER_HEARTBEAT_MS,
    APPS_WORKER_HEARTBEAT_WRITE_TIMEOUT_MS,
    APPS_WORKER_OFFLINE_MS,
    APPS_WORKER_POLL_MS,
    APPS_WORKER_DRAIN_MS,
    APPS_WORKER_STOP_TIMEOUT_MS,
  };
  for (const [name, value] of Object.entries(timings)) assertPositive(name, value);

  if (APPS_OPERATION_LEASE_RENEW_MS >= APPS_OPERATION_LEASE_MS) {
    throw new Error('Apps operation lease renewal must be shorter than the lease');
  }
  if (APPS_OPERATION_LEASE_MS < APPS_OPERATION_LEASE_RENEW_MS * 3) {
    throw new Error('Apps operation lease must allow at least three renewal attempts');
  }
  if (APPS_WORKER_OFFLINE_MS <= APPS_WORKER_HEARTBEAT_MS) {
    throw new Error('Apps worker offline threshold must exceed the heartbeat interval');
  }
  if (APPS_WORKER_DRAIN_MS >= APPS_WORKER_STOP_TIMEOUT_MS) {
    throw new Error('Apps worker drain must finish before the systemd stop timeout');
  }
  if (
    APPS_WORKER_DRAIN_MS + APPS_WORKER_HEARTBEAT_WRITE_TIMEOUT_MS >=
    APPS_WORKER_STOP_TIMEOUT_MS
  ) {
    throw new Error(
      'Apps worker drain and final heartbeat must finish before the systemd stop timeout'
    );
  }
}

validateAppsWorkerTimingConfig();

export function appsOperationLeaseExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + APPS_OPERATION_LEASE_MS);
}

export function appsOperationDeadlineAt(now = new Date()): Date {
  return new Date(now.getTime() + APPS_OPERATION_DEADLINE_MS);
}
