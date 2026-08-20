'use client';

import { useRef, type ReactNode, type RefObject } from 'react';
import { Dialog, type DialogProps } from './Dialog';

interface AlertDialogProps extends Omit<
  DialogProps,
  'footer' | 'initialFocusRef' | 'role' | 'size'
> {
  cancel: ReactNode;
  action: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

export function AlertDialog({
  cancel,
  action,
  children,
  initialFocusRef,
  ...props
}: AlertDialogProps) {
  const cancelContainerRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog
      {...props}
      role="alertdialog"
      size="sm"
      initialFocusRef={initialFocusRef ?? cancelContainerRef}
      footer={
        <>
          <div ref={cancelContainerRef} className="contents">
            {cancel}
          </div>
          {action}
        </>
      }
    >
      {children}
    </Dialog>
  );
}
