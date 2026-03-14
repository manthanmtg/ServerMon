'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface AutoscrollButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onToggle'> {
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
}

const AutoscrollButton = React.forwardRef<HTMLButtonElement, AutoscrollButtonProps>(
    ({ enabled, onToggle, className, ...props }, ref) => {
        return (
            <Button
                ref={ref}
                variant="outline"
                size="sm"
                onClick={() => onToggle(!enabled)}
                className={cn(
                    'h-9 px-3 transition-all duration-200 active:scale-95 border-border/50',
                    enabled 
                        ? 'bg-blue-500/10 border-blue-500/40 text-blue-500 shadow-sm shadow-blue-500/10' 
                        : 'bg-muted/30 hover:bg-muted/50 text-muted-foreground hover:text-foreground',
                    className
                )}
                {...props}
            >
                <span className="text-xs font-semibold tracking-tight">
                    Autoscroll: <span className={cn(enabled ? "text-blue-500" : "text-muted-foreground/60")}>{enabled ? 'ON' : 'OFF'}</span>
                </span>
            </Button>
        );
    }
);

AutoscrollButton.displayName = 'AutoscrollButton';

export { AutoscrollButton };
