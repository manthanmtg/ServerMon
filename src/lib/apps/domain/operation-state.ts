import type { AppV2OperationStatus } from '@/modules/apps/types';

const ACTIVE_OPERATION_STATUSES = new Set<AppV2OperationStatus>([
  'queued',
  'running',
  'cancel_requested',
]);

const TERMINAL_OPERATION_STATUSES = new Set<AppV2OperationStatus>([
  'succeeded',
  'failed',
  'cancelled',
  'unchanged',
]);

const ALLOWED_TRANSITIONS: ReadonlyMap<
  AppV2OperationStatus,
  ReadonlySet<AppV2OperationStatus>
> = new Map([
  ['queued', new Set(['running', 'cancelled', 'failed'])],
  ['running', new Set(['cancel_requested', 'succeeded', 'failed', 'unchanged'])],
  ['cancel_requested', new Set(['cancelled', 'failed', 'succeeded'])],
  ['succeeded', new Set()],
  ['failed', new Set()],
  ['cancelled', new Set()],
  ['unchanged', new Set()],
]);

export function isActiveOperationStatus(status: AppV2OperationStatus): boolean {
  return ACTIVE_OPERATION_STATUSES.has(status);
}

export function isTerminalOperationStatus(status: AppV2OperationStatus): boolean {
  return TERMINAL_OPERATION_STATUSES.has(status);
}

export function canTransitionOperationStatus(
  from: AppV2OperationStatus,
  to: AppV2OperationStatus
): boolean {
  if (from === to) return true;
  if (isTerminalOperationStatus(from)) return false;
  return ALLOWED_TRANSITIONS.get(from)?.has(to) ?? false;
}

export function assertOperationStatusTransition(
  from: AppV2OperationStatus,
  to: AppV2OperationStatus
): void {
  if (canTransitionOperationStatus(from, to)) return;
  if (isTerminalOperationStatus(from)) {
    throw new Error(`Terminal app operation status cannot transition from ${from} to ${to}`);
  }
  throw new Error(`Invalid app operation status transition from ${from} to ${to}`);
}
