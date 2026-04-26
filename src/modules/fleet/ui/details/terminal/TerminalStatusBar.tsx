'use client';

import { Wifi, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { FleetTerminalTab, statusLabel, statusVariant } from './types';

interface TerminalStatusBarProps {
  activeTab: FleetTerminalTab | null;
}

export function TerminalStatusBar({ activeTab }: TerminalStatusBarProps) {
  return (
    <div className="flex h-9 items-center justify-between border-b border-border bg-secondary/40 px-4">
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
        </div>
        <span className="truncate pl-1.5 text-xs text-muted-foreground">
          {activeTab?.label ?? 'Terminal'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={statusVariant(activeTab?.status ?? 'idle')} className="text-[10px]">
          {activeTab?.status === 'connected' ? (
            <Wifi className="h-3 w-3" />
          ) : (
            <WifiOff className="h-3 w-3" />
          )}
          {statusLabel(activeTab)}
        </Badge>
      </div>
    </div>
  );
}
