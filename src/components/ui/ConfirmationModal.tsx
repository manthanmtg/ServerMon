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
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'info';
    isLoading?: boolean;
}

export default function ConfirmationModal({
    isOpen,
    onConfirm,
    onCancel,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'danger',
    isLoading = false
}: ConfirmationModalProps) {
    const modalRef = useRef<HTMLDivElement>(null);

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
                    "relative w-full max-w-md overflow-hidden rounded-3xl border border-border/50 bg-card/90 backdrop-blur-xl shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300",
                    "before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/5 before:to-transparent before:pointer-events-none"
                )}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title"
                aria-describedby="modal-message"
            >
                <div className="p-6">
                    <div className="flex items-start gap-4">
                        <div className={cn(
                            "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                            variant === 'danger' ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                        )}>
                            <Icon className="h-6 w-6" />
                        </div>
                        <div className="flex-1 space-y-2 pt-1">
                            <h3 id="modal-title" className="text-lg font-bold tracking-tight text-foreground">
                                {title}
                            </h3>
                            <p id="modal-message" className="text-sm leading-relaxed text-muted-foreground">
                                {message}
                            </p>
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
                        variant={variant === 'danger' ? 'destructive' : 'default'}
                        onClick={onConfirm}
                        loading={isLoading}
                        className={cn(
                            "w-full sm:w-auto h-11 px-6 rounded-xl font-bold shadow-lg transition-all duration-300",
                            variant === 'danger' ? "shadow-destructive/20 hover:shadow-destructive/30" : "shadow-primary/20 hover:shadow-primary/30"
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
