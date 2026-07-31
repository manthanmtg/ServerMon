export const APPS_OPERATION_LEASE_MS = 30_000;
export const APPS_WORKER_HEARTBEAT_MS = 5_000;
export const APPS_WORKER_POLL_MS = 1_000;
export const APPS_OPERATION_DEADLINE_MS = 60 * 60 * 1_000;
export const APPS_OPERATION_EVENT_RETENTION_DAYS = 90;

export function appsOperationLeaseExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + APPS_OPERATION_LEASE_MS);
}
