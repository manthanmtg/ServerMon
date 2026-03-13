'use client';

import * as React from 'react';
import { MousePointer2, ArrowDown } from 'lucide-react';
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
                    'group relative h-11 px-4 transition-all duration-300 ease-out active:scale-95 overflow-hidden',
                    enabled 
                        ? 'bg-primary/10 border-primary/50 text-primary shadow-[0_0_15px_-3px_rgba(var(--primary),0.2)]' 
                        : 'bg-background hover:bg-accent text-muted-foreground hover:text-foreground',
                    className
                )}
                {...props}
            >
                {/* Background Glow Pulse */}
                {enabled && (
                    <span className="absolute inset-0 bg-primary/5 animate-pulse-slow pointer-events-none" />
                )}
                
                <div className="relative flex items-center gap-2.5 z-10">
                    <div className="relative flex items-center justify-center">
                        <MousePointer2 
                            className={cn(
                                "w-4 h-4 transition-all duration-500",
                                enabled ? "rotate-[15deg] scale-110" : "rotate-0 scale-100 opacity-60"
                            )} 
                        />
                        <ArrowDown 
                            className={cn(
                                "absolute -bottom-1 -right-1 w-3 h-3 transition-all duration-500",
                                enabled 
                                    ? "opacity-100 translate-y-0 animate-bounce" 
                                    : "opacity-0 translate-y-1"
                            )}
                        />
                    </div>
                    
                    <div className="flex flex-col items-start leading-none">
                        <span className="text-[10px] uppercase tracking-[0.14em] font-bold opacity-60">
                            Auto-Scroll
                        </span>
                        <span className={cn(
                            "text-xs font-black uppercase tracking-wider mt-0.5",
                            enabled ? "opacity-100" : "opacity-80"
                        )}>
                            {enabled ? 'Active' : 'Disabled'}
                        </span>
                    </div>
                </div>

                {/* Status dot */}
                <span className={cn(
                    "absolute top-2 right-2 w-1.5 h-1.5 rounded-full transition-all duration-500",
                    enabled 
                        ? "bg-primary shadow-[0_0_8px_var(--primary)] scale-100" 
                        : "bg-muted-foreground/30 scale-75"
                )} />
            </Button>
        );
    }
);

AutoscrollButton.displayName = 'AutoscrollButton';

export { AutoscrollButton };
