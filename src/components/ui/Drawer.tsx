'use client';

import type { ReactNode } from 'react';
import { Dialog } from './Dialog';
import { cn } from '@/lib/utils';

interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  side?: 'left' | 'right';
  dismissible?: boolean;
  className?: string;
}

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  side = 'right',
  dismissible = true,
  className,
}: DrawerProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={footer}
      dismissible={dismissible}
      size="fullscreen"
      className="justify-start p-0"
      contentClassName={cn(
        'absolute inset-y-0 h-dvh max-h-dvh w-[min(92vw,42rem)] max-w-none rounded-none p-0',
        side === 'left' ? 'left-0 border-r' : 'right-0 border-l',
        className
      )}
    >
      {children}
    </Dialog>
  );
}
