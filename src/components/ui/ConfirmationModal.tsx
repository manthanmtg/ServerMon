'use client';

import React, { memo, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Button } from './button';
import { AlertDialog } from './AlertDialog';
import { cn } from '@/lib/utils';

interface ConfirmationModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  description?: string;
  verificationText?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'info' | 'warning';
  isLoading?: boolean;
}

function ConfirmationModal({ isOpen, ...props }: ConfirmationModalProps) {
  if (!isOpen) return null;

  return <ConfirmationModalContent key={props.verificationText ?? ''} {...props} isOpen />;
}

function ConfirmationModalContent({
  onConfirm,
  onCancel,
  title,
  message,
  description,
  verificationText,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  isLoading = false,
}: ConfirmationModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');
  const canConfirm = !isLoading && (!verificationText || inputValue === verificationText);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Enter' || !canConfirm || e.isComposing) return;
      const target = e.target;
      if (target instanceof HTMLElement) {
        const tagName = target.tagName.toLowerCase();
        if (
          tagName === 'textarea' ||
          tagName === 'select' ||
          tagName === 'button' ||
          tagName === 'a' ||
          target.isContentEditable ||
          Boolean(target.closest('[contenteditable]:not([contenteditable="false"])'))
        ) {
          return;
        }
      }
      e.preventDefault();
      onConfirm();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [canConfirm, onConfirm]);

  const Icon = variant === 'danger' ? AlertTriangle : Info;
  const iconColor =
    variant === 'danger'
      ? 'text-destructive'
      : variant === 'warning'
        ? 'text-warning'
        : 'text-primary';
  const iconBg =
    variant === 'danger'
      ? 'bg-destructive/10'
      : variant === 'warning'
        ? 'bg-warning/10'
        : 'bg-primary/10';
  const buttonVariant = variant === 'danger' ? 'destructive' : 'default';
  const shadowColor =
    variant === 'danger'
      ? 'shadow-destructive/20 hover:shadow-destructive/30'
      : variant === 'warning'
        ? 'shadow-warning/20 hover:shadow-warning/30'
        : 'shadow-primary/20 hover:shadow-primary/30';

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title={title}
      description={message}
      closeLabel="Close"
      dismissible={!isLoading}
      initialFocusRef={verificationText ? inputRef : undefined}
      cancel={
        <Button
          variant="ghost"
          onClick={onCancel}
          disabled={isLoading}
          className="h-11 w-full rounded-xl px-6 font-medium sm:w-auto"
        >
          {cancelLabel}
        </Button>
      }
      action={
        <Button
          variant={buttonVariant}
          onClick={onConfirm}
          loading={isLoading}
          disabled={!canConfirm}
          className={cn(
            'h-11 w-full rounded-xl px-6 font-bold shadow-lg transition-all duration-300 sm:w-auto',
            shadowColor,
            !canConfirm && 'cursor-not-allowed opacity-50 grayscale shadow-none'
          )}
        >
          {confirmLabel}
        </Button>
      }
    >
      <div
        className={cn(
          'relative flex items-start gap-4 rounded-2xl border border-border/40 bg-muted/20 p-4',
          'before:pointer-events-none before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/5 before:to-transparent'
        )}
      >
        <div
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl',
            iconBg,
            iconColor
          )}
          aria-hidden="true"
        >
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1 space-y-3 pt-1">
          {description && (
            <div className="rounded-xl border border-border/40 bg-muted/40 p-3">
              <p className="break-all font-mono text-xs text-foreground/80">{description}</p>
            </div>
          )}
          {verificationText && (
            <div className="space-y-2">
              <p
                id="verification-instruction"
                className="text-[11px] font-medium tracking-wider text-muted-foreground"
              >
                Type{' '}
                <span className="font-mono font-bold text-foreground">
                  &quot;{verificationText}&quot;
                </span>{' '}
                to confirm
              </p>
              <input
                ref={inputRef}
                type="text"
                aria-labelledby="verification-instruction"
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                placeholder={verificationText}
                className="h-11 w-full rounded-xl border border-border/50 bg-background/50 px-4 font-mono text-sm outline-none transition-all placeholder:opacity-30 focus:ring-2 focus:ring-primary/30"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
              />
            </div>
          )}
        </div>
      </div>
    </AlertDialog>
  );
}

export default memo(ConfirmationModal);
