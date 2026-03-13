'use client';

import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BreadcrumbSegment {
    label: string;
    path: string;
}

interface Props {
    segments: BreadcrumbSegment[];
    onNavigate: (path: string) => void;
}

export function FileBrowserBreadcrumbs({ segments, onNavigate }: Props) {
    const shouldCollapse = segments.length > 3;
    const visibleSegments = shouldCollapse
        ? [segments[0], ...segments.slice(-2)]
        : segments;

    return (
        <div className="flex items-center gap-0.5 md:gap-1 text-[11px] md:text-xs text-muted-foreground min-w-0 overflow-hidden">
            {shouldCollapse && (
                <>
                    <button
                        className="flex items-center gap-1.5 rounded-md px-1.5 py-1 md:px-2 transition-colors hover:bg-accent hover:text-foreground shrink-0"
                        onClick={() => onNavigate(segments[0].path)}
                    >
                        <Home className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{segments[0].label}</span>
                    </button>
                    <ChevronRight className="h-3 w-3 opacity-50 shrink-0" />
                    <span className="px-1 text-muted-foreground/40 shrink-0">…</span>
                    <ChevronRight className="h-3 w-3 opacity-50 shrink-0" />
                    {segments.slice(-2).map((segment, idx) => (
                        <React.Fragment key={segment.path}>
                            <button
                                className={cn(
                                    "rounded-md px-1.5 py-1 md:px-2 transition-colors hover:bg-accent hover:text-foreground truncate max-w-[120px] md:max-w-[200px]",
                                    idx === 1 && "font-medium text-foreground"
                                )}
                                onClick={() => onNavigate(segment.path)}
                                title={segment.label}
                            >
                                {segment.label}
                            </button>
                            {idx < 1 && <ChevronRight className="h-3 w-3 opacity-50 shrink-0" />}
                        </React.Fragment>
                    ))}
                </>
            )}
            {!shouldCollapse && visibleSegments.map((segment, index) => (
                <React.Fragment key={segment.path}>
                    <button
                        className={cn(
                            "flex items-center gap-1.5 rounded-md px-1.5 py-1 md:px-2 transition-colors hover:bg-accent hover:text-foreground truncate max-w-[120px] md:max-w-[200px]",
                            index === visibleSegments.length - 1 && "font-medium text-foreground"
                        )}
                        onClick={() => onNavigate(segment.path)}
                        title={segment.label}
                    >
                        {index === 0 ? <Home className="w-3.5 h-3.5 shrink-0" /> : null}
                        {segment.label}
                    </button>
                    {index < visibleSegments.length - 1 && (
                        <ChevronRight className="h-3 w-3 opacity-50 shrink-0" />
                    )}
                </React.Fragment>
            ))}
        </div>
    );
}
