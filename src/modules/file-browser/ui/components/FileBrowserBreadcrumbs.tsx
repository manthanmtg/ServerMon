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
    return (
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {segments.map((segment, index) => (
                <React.Fragment key={segment.path}>
                    <button
                        className={cn(
                            "flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-accent hover:text-foreground",
                            index === segments.length - 1 && "font-medium text-foreground"
                        )}
                        onClick={() => onNavigate(segment.path)}
                    >
                        {index === 0 ? <Home className="w-3.5 h-3.5" /> : null}
                        {segment.label}
                    </button>
                    {index < segments.length - 1 && (
                        <ChevronRight className="h-3 w-3 opacity-50" />
                    )}
                </React.Fragment>
            ))}
        </div>
    );
}
