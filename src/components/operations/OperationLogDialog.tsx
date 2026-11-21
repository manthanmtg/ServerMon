'use client';

import type { ComponentProps, ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/Dialog';
import { OperationLogViewer } from './OperationLogViewer';
import { getOperationStatusPresentation } from './operation-status';

export interface OperationLogDialogProps extends Omit<
  ComponentProps<typeof OperationLogViewer>,
  'label' | 'onRequestFullscreen'
> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  target?: string;
  operationId?: string;
  startedAt?: string;
  details?: ReactNode;
  footer?: ReactNode;
}

export function OperationLogDialog({
  open,
  onOpenChange,
  title,
  target,
  operationId,
  startedAt,
  details,
  footer,
  status,
  ...viewerProps
}: OperationLogDialogProps) {
  const presentation = getOperationStatusPresentation(status);
  const StatusIcon = presentation.icon;
  const formattedStartedAt = startedAt ? new Date(startedAt).toLocaleString() : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="fullscreen"
      closeLabel={`Close ${title}`}
      footer={footer}
      description={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {target && <span className="font-medium text-foreground">{target}</span>}
          {operationId && <span>Operation {operationId}</span>}
          {startedAt && <time dateTime={startedAt}>{formattedStartedAt}</time>}
          <Badge variant={presentation.variant}>
            <StatusIcon
              className={
                presentation.live
                  ? 'h-3.5 w-3.5 animate-spin motion-reduce:animate-none'
                  : 'h-3.5 w-3.5'
              }
              aria-hidden="true"
            />
            {presentation.label}
          </Badge>
        </div>
      }
      contentClassName="h-[min(94dvh,64rem)]"
    >
      <div className="flex h-full min-h-0 flex-col gap-4">
        {details}
        <OperationLogViewer
          {...viewerProps}
          status={status}
          label={`${title} output`}
          maxHeightClassName="max-h-none h-full"
          className="flex min-h-0 flex-1 flex-col [&>div:last-child]:min-h-0 [&>div:last-child]:flex-1"
        />
      </div>
    </Dialog>
  );
}
