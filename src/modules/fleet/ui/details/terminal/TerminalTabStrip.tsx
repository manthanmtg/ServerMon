'use client';

import { Check, Clipboard, Copy, Pencil, Plus, X, Zap } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FleetTerminalTab } from './types';

interface TerminalTabStripProps {
  tabs: FleetTerminalTab[];
  activeTabId: string | null;
  onSetActiveTabId: (id: string) => void;
  onAddTab: () => void;
  onCloseTab: (id: string) => void;
  onRenameTab: (id: string, newLabel: string) => void;
  onIssueAction: (action: 'clear' | 'copy' | 'focus') => void;
  onPasteClipboard: () => void;
  activeTabStarted: boolean;
}

export function TerminalTabStrip({
  tabs,
  activeTabId,
  onSetActiveTabId,
  onAddTab,
  onCloseTab,
  onRenameTab,
  onIssueAction,
  onPasteClipboard,
  activeTabStarted,
}: TerminalTabStripProps) {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const editInputRef = useRef<HTMLInputElement | null>(null);

  const startRename = (tab: FleetTerminalTab) => {
    setEditingTabId(tab.sessionId);
    setEditLabel(tab.label);
    setTimeout(() => editInputRef.current?.focus(), 30);
  };

  const commitRename = (sessionId: string) => {
    const trimmed = editLabel.trim();
    if (trimmed) {
      onRenameTab(sessionId, trimmed.slice(0, 28));
    }
    setEditingTabId(null);
  };

  return (
    <div className="flex flex-col border-b border-border bg-card/80 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto p-2">
        {tabs.map((tab) => (
          <div
            key={tab.sessionId}
            role="button"
            tabIndex={0}
            onClick={() => onSetActiveTabId(tab.sessionId)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSetActiveTabId(tab.sessionId);
              }
            }}
            className={cn(
              'group flex h-9 shrink-0 items-center gap-1.5 rounded-lg pl-3 pr-1.5 text-xs font-medium transition-colors',
              tab.sessionId === activeTabId
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary/70 text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                tab.status === 'connected'
                  ? 'bg-success'
                  : tab.status === 'connecting'
                    ? 'bg-warning animate-pulse'
                    : tab.status === 'error' || tab.status === 'disconnected'
                      ? 'bg-destructive'
                      : 'bg-muted-foreground'
              )}
            />
            {editingTabId === tab.sessionId ? (
              <form
                className="flex items-center gap-1"
                onClick={(event) => event.stopPropagation()}
                onSubmit={(event) => {
                  event.preventDefault();
                  commitRename(tab.sessionId);
                }}
              >
                <input
                  ref={editInputRef}
                  value={editLabel}
                  onChange={(event) => setEditLabel(event.target.value)}
                  onBlur={() => commitRename(tab.sessionId)}
                  className="w-24 border-b border-current bg-transparent text-xs outline-none"
                  maxLength={28}
                />
                <button type="submit" className="rounded p-0.5 hover:bg-white/10" title="Save name">
                  <Check className="h-3 w-3" />
                </button>
              </form>
            ) : (
              <span
                className="max-w-[120px] truncate"
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  startRename(tab);
                }}
              >
                {tab.label}
              </span>
            )}
            {editingTabId !== tab.sessionId && (
              <span
                role="button"
                tabIndex={0}
                className="rounded p-0.5 opacity-0 transition-opacity hover:bg-white/10 group-hover:opacity-100"
                onClick={(event) => {
                  event.stopPropagation();
                  startRename(tab);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    startRename(tab);
                  }
                }}
                title="Rename"
              >
                <Pencil className="h-3 w-3" />
              </span>
            )}
            <span
              role="button"
              tabIndex={0}
              className="rounded p-0.5 opacity-0 transition-opacity hover:bg-white/10 group-hover:opacity-100"
              onClick={(event) => {
                event.stopPropagation();
                onCloseTab(tab.sessionId);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  onCloseTab(tab.sessionId);
                }
              }}
              title="Close"
            >
              <X className="h-3 w-3" />
            </span>
          </div>
        ))}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={onAddTab}
          title="New tab"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-t border-border p-2 xl:border-l xl:border-t-0">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onIssueAction('copy')}
          disabled={!activeTabStarted}
          title="Copy selection"
        >
          <Copy className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onPasteClipboard}
          disabled={!activeTabId}
          title="Paste"
        >
          <Clipboard className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onIssueAction('clear')}
          disabled={!activeTabStarted}
          title="Clear"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Zap className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
