'use client';

import React, { useEffect, useRef } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';
import { Button } from './button';
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

export default function ConfirmationModal({
  isOpen,
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
  const modalRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = React.useState('');

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter' && !isLoading) onConfirm();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel, onConfirm, isLoading]);

  if (!isOpen) return null;

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onCancel}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        className={cn(
          'relative w-full max-w-md overflow-hidden rounded-3xl border border-border/50 bg-card/90 backdrop-blur-xl shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300',
          'before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/5 before:to-transparent before:pointer-events-none'
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby="modal-message"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl',
                iconBg,
                iconColor
              )}
            >
              <Icon className="h-6 w-6" />
            </div>
            <div className="flex-1 space-y-2 pt-1">
              <h3 id="modal-title" className="text-lg font-bold tracking-tight text-foreground">
                {title}
              </h3>
              <p id="modal-message" className="text-sm leading-relaxed text-muted-foreground">
                {message}
              </p>
              {description && (
                <div className="mt-2 p-3 rounded-xl bg-muted/40 border border-border/40">
                  <p className="text-xs font-mono break-all text-foreground/80">{description}</p>
                </div>
              )}
              {verificationText && (
                <div className="mt-4 space-y-2">
                  <p className="text-[11px] font-medium text-muted-foreground tracking-wider">
                    Type{' '}
                    <span className="text-foreground font-bold font-mono">
                      &quot;{verificationText}&quot;
                    </span>{' '}
                    to confirm
                  </p>
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={verificationText}
                    className="w-full h-11 px-4 rounded-xl border border-border/50 bg-background/50 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/30 transition-all placeholder:opacity-30"
                    autoFocus
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row items-center gap-3 p-6 pt-2 bg-muted/20">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={isLoading}
            className="w-full sm:w-auto h-11 px-6 rounded-xl font-medium"
          >
            {cancelLabel}
          </Button>
          <Button
            variant={buttonVariant}
            onClick={onConfirm}
            loading={isLoading}
            disabled={!!verificationText && inputValue !== verificationText}
            className={cn(
              'w-full sm:w-auto h-11 px-6 rounded-xl font-bold shadow-lg transition-all duration-300',
              shadowColor,
              !!verificationText &&
                inputValue !== verificationText &&
                'opacity-50 grayscale cursor-not-allowed shadow-none'
            )}
          >
            {confirmLabel}
          </Button>
        </div>

        <button
          onClick={onCancel}
          className="absolute top-4 right-4 h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
