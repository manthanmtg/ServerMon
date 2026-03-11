'use client';

import React from 'react';
import TerminalUI from './TerminalUI';
import { Badge } from '@/components/ui/badge';

export default function TerminalPage() {
    const handleTerminalData = (data: string) => {
        console.log('Terminal data:', data);
    };

    return (
        <div className="h-full flex flex-col gap-3">
            <div className="flex-1 flex flex-col rounded-xl border border-border bg-card overflow-hidden">
                {/* Title bar */}
                <div className="h-10 border-b border-border bg-secondary/50 flex items-center justify-between px-4 shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="flex gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-destructive/60" />
                            <div className="w-3 h-3 rounded-full bg-warning/60" />
                            <div className="w-3 h-3 rounded-full bg-success/60" />
                        </div>
                        <span className="text-xs text-muted-foreground ml-2">Terminal</span>
                    </div>
                    <Badge variant="success">
                        <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                        Connected
                    </Badge>
                </div>
                {/* Terminal body */}
                <div className="flex-1 relative bg-[#0a0a0a]">
                    <TerminalUI onData={handleTerminalData} />
                </div>
            </div>
        </div>
    );
}
