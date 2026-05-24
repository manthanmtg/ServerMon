'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface AutoscrollButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onToggle'
> {
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
        aria-pressed={enabled}
        className={cn(
          'h-9 px-3 transition-all duration-200 active:scale-95 border-border/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
          enabled
            ? 'bg-primary/10 border-primary/40 text-primary shadow-sm shadow-primary/10'
            : 'bg-muted/30 hover:bg-muted/50 text-muted-foreground hover:text-foreground',
          className
        )}
        {...props}
      >
        <span className="text-xs font-semibold tracking-tight">
          Autoscroll:{' '}
          <span className={cn(enabled ? 'text-primary/90' : 'text-muted-foreground/60')}>
            {enabled ? 'ON' : 'OFF'}
          </span>
        </span>
      </Button>
    );
  }
);

AutoscrollButton.displayName = 'AutoscrollButton';

export { AutoscrollButton };
