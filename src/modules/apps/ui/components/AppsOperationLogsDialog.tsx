'use client';

import { OperationLogDialog } from '@/components/operations/OperationLogDialog';
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
    />
  );
}
