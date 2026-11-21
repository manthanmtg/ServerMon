'use client';

import { useState } from 'react';
import { resilientFetch } from '@/lib/fetch-utils';
import { OperationLogDialog } from '@/components/operations/OperationLogDialog';
import { Button } from '@/components/ui/button';
import type { OperationStatus } from '@/components/operations/operation-status';
import type { AppOperation, AppOperationType } from '../../types';

const operationTitles: Record<AppOperationType, string> = {
  deploy: 'Deployment logs',
  update: 'Update logs',
  rollback: 'Rollback logs',
  delete: 'Removal logs',
};

const pendingMessages: Record<AppOperationType, string> = {
  deploy: 'Starting deployment and waiting for output…',
  update: 'Checking for updates and waiting for output…',
  rollback: 'Starting rollback and waiting for output…',
  delete: 'Starting removal and waiting for output…',
};

const queuedMessages: Record<AppOperationType, string> = {
  deploy: 'Deployment queued. Waiting for build output…',
  update: 'Update queued. Waiting for build output…',
  rollback: 'Rollback queued. Waiting for output…',
  delete: 'Removal queued. Waiting for output…',
};

function operationStatus(
  operation: AppOperation | undefined,
  pendingState: 'queueing' | 'starting'
): OperationStatus {
  if (!operation) return pendingState === 'queueing' ? 'submitting' : 'queued';
  return operation.status;
}

type LockReleaseState = 'idle' | 'releasing' | 'released' | 'error';

export interface AppsOperationLogsDialogProps {
  appName: string;
  operationType: AppOperationType;
  operation?: AppOperation;
  pendingState?: 'queueing' | 'starting';
  follow?: boolean;
  onFollowChange?: (follow: boolean) => void;
  autoscroll?: boolean;
  onAutoscrollChange?: (autoscroll: boolean) => void;
  wrap?: boolean;
  onWrapChange?: (wrap: boolean) => void;
  onLockReleased?: () => void | Promise<void>;
  onClose: () => void;
}

export function AppsOperationLogsDialog({
  appName,
  operationType,
  operation,
  pendingState = 'starting',
  follow,
  onFollowChange,
  autoscroll,
  onAutoscrollChange,
  wrap,
  onWrapChange,
  onLockReleased,
  onClose,
}: AppsOperationLogsDialogProps) {
  const title = operationTitles[operationType];
  const status = operationStatus(operation, pendingState);
  const emptyLogsMessage = !operation
    ? pendingState === 'queueing'
      ? pendingMessages[operationType]
      : queuedMessages[operationType]
    : operation.status === 'running'
      ? pendingMessages[operationType]
      : 'No logs were captured for this operation.';

  const [lockState, setLockState] = useState<LockReleaseState>('idle');
  const [lockError, setLockError] = useState<string | null>(null);
  const lockBlocked = operation?.errorCode === 'RECOVERY_REQUIRED' && lockState !== 'released';

  const releaseLock = async () => {
    if (!operation?.id) return;
    setLockState('releasing');
    setLockError(null);
    try {
      const response = await resilientFetch(
        `/api/modules/apps/operations/${operation.id}/release-lock`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirm: true }),
          timeout: 10000,
        }
      );
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const message =
          data &&
          typeof data === 'object' &&
          typeof (data as { error?: unknown }).error === 'string'
            ? (data as { error: string }).error
            : 'Failed to release the operation lock';
        throw new Error(message);
      }
      setLockState('released');
      await onLockReleased?.();
    } catch (err: unknown) {
      setLockState('error');
      setLockError(err instanceof Error ? err.message : 'Failed to release the operation lock');
    }
  };

  const lockNotice =
    operation?.errorCode === 'RECOVERY_REQUIRED' && operation ? (
      <div
        role="alert"
        className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm"
      >
        {lockBlocked ? (
          <>
            <div className="font-medium text-destructive">
              Operation lock is blocking new deploys
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              The Apps worker stopped before this operation completed, so its exclusive app lock is
              still held. Confirm on the host that the previous worker and its build processes have
              stopped, then release the lock.
            </p>
          </>
        ) : (
          <div className="font-medium">Operation lock released</div>
        )}
        {operation.error && (
          <p className="mt-1 break-words text-xs text-destructive">{operation.error}</p>
        )}
        {lockBlocked ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-[44px]"
              disabled={lockState === 'releasing'}
              onClick={() => void releaseLock()}
            >
              {lockState === 'releasing' ? 'Releasing…' : 'Release operation lock'}
            </Button>
            {lockError && <span className="text-xs text-destructive">{lockError}</span>}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Lock released. New deployments are allowed again.
          </p>
        )}
      </div>
    ) : undefined;

  return (
    <OperationLogDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={title}
      target={appName}
      operationId={operation?.id}
      startedAt={operation?.startedAt}
      status={status}
      output={operation?.logs ?? []}
      follow={follow}
      onFollowChange={onFollowChange}
      autoscroll={autoscroll}
      onAutoscrollChange={onAutoscrollChange}
      wrap={wrap}
      onWrapChange={onWrapChange}
      error={operation?.error}
      emptyMessage={emptyLogsMessage}
      downloadableFilename={`${appName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${operationType}.log`}
      details={lockNotice}
    />
  );
}
