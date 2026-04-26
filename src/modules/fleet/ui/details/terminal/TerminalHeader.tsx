'use client';

import { Play, RotateCcw, Sparkles, Terminal as TerminalIcon, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { FleetTerminalTab } from './types';

interface TerminalHeaderProps {
  nodeId: string;
  tabsCount: number;
  activeSessions: number;
  activeTab: FleetTerminalTab | null;
  onStartTab: (sessionId: string) => void;
  onStopTab: (sessionId: string) => void;
  onReconnect: () => void;
  onResetWorkspace: () => void;
}

export function TerminalHeader({
  nodeId,
  tabsCount,
  activeSessions,
  activeTab,
  onStartTab,
  onStopTab,
  onReconnect,
  onResetWorkspace,
}: TerminalHeaderProps) {
  return (
    <CardHeader className="border-b border-border bg-secondary/20">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
            <TerminalIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Terminal</CardTitle>
              <Badge variant="outline" className="hidden sm:inline-flex">
                <Sparkles className="h-3 w-3" />
                Saved
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{nodeId}</span>
              <span>/</span>
              <span>{tabsCount} tabs</span>
              <span>/</span>
              <span>{activeSessions} active</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={activeTab?.started ? 'outline' : 'default'}
            onClick={() =>
              activeTab &&
              (activeTab.started ? onStopTab(activeTab.sessionId) : onStartTab(activeTab.sessionId))
            }
            disabled={!activeTab}
          >
            <Play className="h-3.5 w-3.5" />
            {activeTab?.started ? 'End session' : 'Start session'}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onReconnect}
            disabled={!activeTab}
            title="Reconnect"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onResetWorkspace} title="Reset workspace">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </CardHeader>
  );
}
