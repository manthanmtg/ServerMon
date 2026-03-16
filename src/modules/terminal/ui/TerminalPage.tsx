'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Plus,
  X,
  Settings as SettingsIcon,
  RotateCcw,
  Pencil,
  Check,
  History,
  Bookmark,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import TerminalUI from './TerminalUI';
import TerminalSettingsModal from './TerminalSettingsModal';
import TerminalHistoryModal from './TerminalHistoryModal';
import SavedCommandsModal from './SavedCommandsModal';

interface SessionTab {
  sessionId: string;
  label: string;
  order: number;
  status: 'connected' | 'disconnected' | 'connecting';
  pid?: number;
}

interface TermSettings {
  idleTimeoutMinutes: number;
  maxSessions: number;
  fontSize: number;
  loginAsUser: string;
  defaultDirectory: string;
}

export default function TerminalPage() {
  const [tabs, setTabs] = useState<SessionTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<TermSettings>({
    idleTimeoutMinutes: 30,
    maxSessions: 8,
    fontSize: 14,
    loginAsUser: '',
    defaultDirectory: '',
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSavedCommands, setShowSavedCommands] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<string>('unknown');
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/terminal/sessions');
      const data = await res.json();

      setTabs((prevTabs) => {
        const sessions = (data.sessions || []).map((s: SessionTab) => {
          const existing = prevTabs.find((t) => t.sessionId === s.sessionId);
          return {
            ...s,
            status: existing?.status || ('connecting' as const),
          };
        });

        if (sessions.length === 0) {
          fetch('/api/terminal/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: 'Terminal 1' }),
          })
            .then((res) => res.json())
            .then((created) => {
              if (created.session) {
                setTabs([{ ...created.session, status: 'connecting' as const }]);
                if (!activeTabId) setActiveTabId(created.session.sessionId);
              }
            });
          return prevTabs;
        }

        if (!activeTabId && sessions.length > 0) {
          setActiveTabId(sessions[0].sessionId);
        }
        return sessions;
      });
    } catch {
      toast({ title: 'Failed to load terminal sessions', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast, activeTabId]);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/terminal/settings');
      const data = await res.json();
      if (data.settings) setSettings(data.settings);
    } catch {
      /* use defaults */
    }
  }, []);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.user?.username) setCurrentUser(data.user.username);
    } catch {
      /* fallback to unknown */
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    fetchSettings();
    fetchUser();
  }, [fetchSessions, fetchSettings, fetchUser]);

  const addTab = async () => {
    if (tabs.length >= settings.maxSessions) {
      toast({ title: `Maximum ${settings.maxSessions} sessions reached`, variant: 'warning' });
      return;
    }
    try {
      const res = await fetch('/api/terminal/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: `Terminal ${tabs.length + 1}` }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || 'Failed to create session', variant: 'destructive' });
        return;
      }
      const newTab: SessionTab = { ...data.session, status: 'connecting' };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.sessionId);
    } catch {
      toast({ title: 'Failed to create session', variant: 'destructive' });
    }
  };

  const closeTab = async (sessionId: string) => {
    try {
      await fetch(`/api/terminal/sessions?sessionId=${sessionId}`, { method: 'DELETE' });
      setTabs((prev) => {
        const next = prev.filter((t) => t.sessionId !== sessionId);
        if (activeTabId === sessionId && next.length > 0) {
          setActiveTabId(next[0].sessionId);
        }
        return next;
      });
      if (tabs.length <= 1) {
        fetchSessions();
      }
    } catch {
      toast({ title: 'Failed to close session', variant: 'destructive' });
    }
  };

  const resetAll = async () => {
    try {
      const res = await fetch('/api/terminal/sessions?resetAll=true', { method: 'DELETE' });
      const data = await res.json();
      if (data.sessions) {
        const resetTabs = data.sessions.map((s: SessionTab) => ({
          ...s,
          status: 'connecting' as const,
        }));
        setTabs(resetTabs);
        setActiveTabId(resetTabs[0]?.sessionId || null);
      }
      setShowResetConfirm(false);
      toast({ title: 'Terminals reset', variant: 'success' });
    } catch {
      toast({ title: 'Failed to reset', variant: 'destructive' });
    }
  };

  const startRename = (tab: SessionTab) => {
    setEditingTabId(tab.sessionId);
    setEditLabel(tab.label);
    setTimeout(() => editInputRef.current?.focus(), 50);
  };

  const commitRename = async (sessionId: string) => {
    const trimmed = editLabel.trim();
    if (!trimmed) {
      setEditingTabId(null);
      return;
    }
    try {
      await fetch('/api/terminal/sessions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, label: trimmed }),
      });
      setTabs((prev) =>
        prev.map((t) => (t.sessionId === sessionId ? { ...t, label: trimmed } : t))
      );
    } catch {
      /* ignore */
    }
    setEditingTabId(null);
  };

  const updateTabStatus = useCallback(
    (sessionId: string, status: 'connected' | 'disconnected' | 'connecting') => {
      setTabs((prev) => prev.map((t) => (t.sessionId === sessionId ? { ...t, status } : t)));
    },
    []
  );

  const handleSettingsSaved = (newSettings: TermSettings) => {
    setSettings(newSettings);
    toast({ title: 'Terminal settings saved', variant: 'success' });
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col gap-2 animate-fade-in">
        <div className="flex items-center gap-1 shrink-0">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-20 rounded-lg" />
        </div>
        <div className="flex-1 rounded-lg border border-border bg-card overflow-hidden">
          <div className="h-full flex items-center justify-center p-8">
            <div className="space-y-3 text-center">
              <Skeleton className="h-4 w-32 mx-auto rounded" />
              <Skeleton className="h-3 w-48 mx-auto rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activeTab = tabs.find((t) => t.sessionId === activeTabId);

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Toolbar */}
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
              onClick={() => setActiveTabId(tab.sessionId)}
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
                  onSubmit={(e) => {
                    e.preventDefault();
                    commitRename(tab.sessionId);
                  }}
                  className="flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    ref={editInputRef}
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onBlur={() => commitRename(tab.sessionId)}
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
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    startRename(tab);
                  }}
                  title="Double-click to rename"
                >
                  {tab.label}
                </span>
              )}
              {editingTabId !== tab.sessionId && (
                <button
                  className="p-0.5 opacity-0 group-hover:opacity-100 hover:bg-white/10 rounded transition-opacity ml-auto"
                  onClick={(e) => {
                    e.stopPropagation();
                    startRename(tab);
                  }}
                  title="Rename"
                >
                  <Pencil className="w-2.5 h-2.5" />
                </button>
              )}
              {tabs.length > 1 && (
                <button
                  className="p-0.5 opacity-0 group-hover:opacity-100 hover:bg-white/10 rounded transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.sessionId);
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
            onClick={addTab}
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
            onClick={() => setShowResetConfirm(true)}
            title="Reset all terminals"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-primary"
            onClick={() => setShowSavedCommands(true)}
            title="Saved commands"
          >
            <Bookmark className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-primary"
            onClick={() => setShowHistory(true)}
            title="Session history"
          >
            <History className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => setShowSettings(true)}
            title="Terminal settings"
          >
            <SettingsIcon className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Terminal body */}
      <div className="flex-1 rounded-xl border border-border bg-card overflow-hidden flex flex-col">
        <div className="h-9 border-b border-border bg-secondary/50 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-warning/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-success/60" />
            </div>
            <span className="text-xs text-muted-foreground ml-1.5">
              {activeTab?.label || 'Terminal'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Badge
              variant={
                activeTab?.status === 'connected'
                  ? 'success'
                  : activeTab?.status === 'connecting'
                    ? 'secondary'
                    : 'destructive'
              }
              className="text-[10px]"
            >
              {activeTab?.status === 'connected' && (
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              )}
              {activeTab?.status === 'connected'
                ? 'Connected'
                : activeTab?.status === 'connecting'
                  ? 'Connecting...'
                  : 'Disconnected'}
            </Badge>
            {activeTab?.pid && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-primary/5 border border-primary/10 text-[10px] text-primary/80 font-mono">
                <span className="text-[9px] uppercase tracking-wider opacity-60">PID</span>
                <span>{activeTab.pid}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 relative">
          {tabs.map((tab) => (
            <div
              key={tab.sessionId}
              className={cn(
                'absolute inset-0',
                tab.sessionId === activeTabId ? 'z-10' : 'z-0 invisible'
              )}
            >
              <TerminalUI
                sessionId={tab.sessionId}
                label={tab.label}
                username={currentUser}
                fontSize={settings.fontSize}
                onStatusChange={(status) => updateTabStatus(tab.sessionId, status)}
                initialCommand={
                  tab.sessionId === activeTabId && pendingCommand ? pendingCommand : undefined
                }
              />
            </div>
          ))}
        </div>
      </div>

      {/* Reset Confirmation */}
      {showResetConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setShowResetConfirm(false)}
        >
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <div
            className="relative rounded-xl border border-border bg-card p-6 max-w-sm w-full animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-foreground mb-2">Reset all terminals?</h3>
            <p className="text-sm text-muted-foreground mb-5">
              This will close all terminal sessions and create a single new one. Active connections
              will be lost.
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setShowResetConfirm(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={resetAll}>
                Reset
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Saved Commands Modal */}
      {showSavedCommands && (
        <SavedCommandsModal
          onClose={() => setShowSavedCommands(false)}
          onRunCommand={(cmd) => {
            setPendingCommand(cmd);
            setTimeout(() => setPendingCommand(null), 100);
          }}
        />
      )}

      {/* History Modal */}
      {showHistory && <TerminalHistoryModal onClose={() => setShowHistory(false)} />}

      {/* Settings Modal */}
      {showSettings && (
        <TerminalSettingsModal
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSaved={handleSettingsSaved}
        />
      )}
    </div>
  );
}
