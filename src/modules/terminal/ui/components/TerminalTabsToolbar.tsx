import React from 'react';
import {
  Bookmark,
  Check,
  History,
  Pencil,
  Plus,
  RotateCcw,
  Settings as SettingsIcon,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface TerminalSessionTab {
  sessionId: string;
  label: string;
  order: number;
  status: 'connected' | 'disconnected' | 'connecting';
  pid?: number;
}

interface TerminalTabsToolbarProps {
  tabs: TerminalSessionTab[];
  activeTabId: string | null;
  editingTabId: string | null;
  editLabel: string;
  editInputRef: React.RefObject<HTMLInputElement | null>;
  onEditLabelChange: (label: string) => void;
  onCommitRename: (sessionId: string) => void;
  onSelectTab: (sessionId: string) => void;
  onAddTab: () => void;
  onStartRename: (tab: TerminalSessionTab) => void;
  onCloseTab: (sessionId: string) => void;
  onShowResetConfirm: () => void;
  onShowSavedCommands: () => void;
  onShowHistory: () => void;
  onShowSettings: () => void;
}

export const TerminalTabsToolbar = React.memo(function TerminalTabsToolbar({
  tabs,
  activeTabId,
  editingTabId,
  editLabel,
  editInputRef,
  onEditLabelChange,
  onCommitRename,
  onSelectTab,
  onAddTab,
  onStartRename,
  onCloseTab,
  onShowResetConfirm,
  onShowSavedCommands,
  onShowHistory,
  onShowSettings,
}: TerminalTabsToolbarProps) {
  return (
    <div className="flex items-center justify-between shrink-0">
      <div className="flex items-center gap-1 overflow-x-auto pb-1 flex-1 min-w-0">
        {tabs.map((tab) => (
          <div
            key={tab.sessionId}
            className={cn(
              'group flex items-center gap-1.5 pl-3 pr-1.5 h-9 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 min-w-0',
              tab.sessionId === activeTabId
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
            onClick={() => onSelectTab(tab.sessionId)}
          >
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full shrink-0',
                tab.status === 'connected'
                  ? 'bg-success'
                  : tab.status === 'connecting'
                    ? 'bg-warning animate-pulse'
                    : 'bg-destructive'
              )}
            />
            {editingTabId === tab.sessionId ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  onCommitRename(tab.sessionId);
                }}
                className="flex items-center gap-1"
                onClick={(event) => event.stopPropagation()}
              >
                <input
                  ref={editInputRef}
                  value={editLabel}
                  onChange={(event) => onEditLabelChange(event.target.value)}
                  onBlur={() => onCommitRename(tab.sessionId)}
                  className="w-20 bg-transparent border-b border-current outline-none text-xs"
                  maxLength={20}
                />
                <button type="submit" className="p-0.5 hover:bg-white/10 rounded">
                  <Check className="w-3 h-3" />
                </button>
              </form>
            ) : (
              <span
                className="truncate max-w-[100px]"
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  onStartRename(tab);
                }}
                title="Double-click to rename"
              >
                {tab.label}
              </span>
            )}
            {editingTabId !== tab.sessionId && (
              <button
                className="p-0.5 opacity-0 group-hover:opacity-100 hover:bg-white/10 rounded transition-opacity ml-auto"
                onClick={(event) => {
                  event.stopPropagation();
                  onStartRename(tab);
                }}
                title="Rename"
              >
                <Pencil className="w-2.5 h-2.5" />
              </button>
            )}
            {tabs.length > 1 && (
              <button
                className="p-0.5 opacity-0 group-hover:opacity-100 hover:bg-white/10 rounded transition-opacity"
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseTab(tab.sessionId);
                }}
                title="Close"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={onAddTab}
          title="New terminal"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex items-center gap-1 shrink-0 ml-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={onShowResetConfirm}
          title="Reset all terminals"
        >
          <RotateCcw className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-primary"
          onClick={onShowSavedCommands}
          title="Saved commands"
        >
          <Bookmark className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-primary"
          onClick={onShowHistory}
          title="Session history"
        >
          <History className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={onShowSettings}
          title="Terminal settings"
        >
          <SettingsIcon className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
});
