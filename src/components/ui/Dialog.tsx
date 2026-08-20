'use client';

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';
import { useOverlayAccessibility } from './overlay/useOverlayAccessibility';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'fullscreen';
  dismissible?: boolean;
  closeLabel?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
  contentClassName?: string;
  role?: 'dialog' | 'alertdialog';
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
  fullscreen: 'h-[min(94dvh,64rem)] max-w-[min(96vw,96rem)]',
};

function textLabel(value: ReactNode) {
  return typeof value === 'string' ? value : 'dialog';
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
  closeLabel,
  initialFocusRef,
  className,
  contentClassName,
  role = 'dialog',
}: DialogProps) {
  const [mounted, setMounted] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => setMounted(true), []);

  useOverlayAccessibility({
    open: open && mounted,
    containerRef: contentRef,
    initialFocusRef: initialFocusRef ?? closeButtonRef,
    dismissible,
    onEscape: () => onOpenChange(false),
  });

  if (!mounted || !open) return null;

  const resolvedCloseLabel = closeLabel ?? `Close ${textLabel(title)}`;

  return createPortal(
    <div
      data-overlay-root
      className={cn(
        'fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 [padding-top:max(0.5rem,env(safe-area-inset-top))] [padding-bottom:max(0.5rem,env(safe-area-inset-bottom))]',
        className
      )}
    >
      <div
        data-testid="dialog-backdrop"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onMouseDown={() => dismissible && onOpenChange(false)}
      />
      <div
        ref={contentRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl',
          sizeClasses[size],
          contentClassName
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            {description && (
              <div id={descriptionId} className="mt-1 text-sm text-muted-foreground">
                {description}
              </div>
            )}
          </div>
          {dismissible && (
            <Button
              ref={closeButtonRef}
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 shrink-0"
              aria-label={resolvedCloseLabel}
              onClick={() => onOpenChange(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          )}
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">{children}</div>
        {footer && (
          <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-border bg-muted/20 p-4 sm:flex-row sm:justify-end sm:p-5">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}
