'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Terminal as TerminalIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { FleetTerminalPane } from './terminal/FleetTerminalPane';
import { QuickCommands } from './terminal/QuickCommands';
import { TerminalHeader } from './terminal/TerminalHeader';
import { TerminalStatusBar } from './terminal/TerminalStatusBar';
import { TerminalTabStrip } from './terminal/TerminalTabStrip';
import {
  ActionRequest,
  browserStorage,
  CommandRequest,
  FleetTerminalStatus,
  FleetTerminalTab,
  loadStoredTabs,
  makeSessionId,
  makeTab,
  storageKey,
} from './terminal/types';

interface NodeTerminalProps {
  nodeId: string;
}

export function NodeTerminal({ nodeId }: NodeTerminalProps) {
  const initialWorkspace = useMemo(() => loadStoredTabs(nodeId), [nodeId]);
  const [tabs, setTabs] = useState<FleetTerminalTab[]>(initialWorkspace.tabs);
  const [activeTabId, setActiveTabId] = useState<string | null>(initialWorkspace.activeTabId);
  const [commandRequest, setCommandRequest] = useState<CommandRequest | null>(null);
  const [actionRequest, setActionRequest] = useState<ActionRequest | null>(null);
  const requestCounterRef = useRef(0);
  const { toast } = useToast();

  const activeTab = tabs.find((tab) => tab.sessionId === activeTabId) ?? tabs[0] ?? null;
  const activeSessions = tabs.filter((tab) => tab.started).length;

  useEffect(() => {
    const storage = browserStorage();
    if (!storage) return;
    const payload = JSON.stringify({ tabs, activeTabId });
    storage.setItem(storageKey(nodeId), payload);
  }, [activeTabId, nodeId, tabs]);

  const updateTab = useCallback(
    (sessionId: string, updater: (tab: FleetTerminalTab) => FleetTerminalTab) => {
      setTabs((current) =>
        current.map((tab) => (tab.sessionId === sessionId ? updater(tab) : tab))
      );
    },
    []
  );

  const updateTabStatus = useCallback(
    (sessionId: string, status: FleetTerminalStatus, message?: string) => {
      updateTab(sessionId, (tab) => ({
        ...tab,
        status,
        statusMessage: message,
        lastActiveAt: new Date().toISOString(),
      }));
    },
    [updateTab]
  );

  const addTab = () => {
    const next = makeTab(nodeId, tabs.length + 1);
    setTabs((current) => [...current, next]);
    setActiveTabId(next.sessionId);
  };

  const startTab = (sessionId: string) => {
    updateTab(sessionId, (tab) => ({
      ...tab,
      started: true,
      status: 'connecting',
      statusMessage: undefined,
      lastActiveAt: new Date().toISOString(),
    }));
  };

  const stopTab = (sessionId: string) => {
    updateTab(sessionId, (tab) => ({
      ...tab,
      started: false,
      status: 'idle',
      statusMessage: undefined,
      lastActiveAt: new Date().toISOString(),
    }));
  };

  const closeTab = (sessionId: string) => {
    setTabs((current) => {
      const next = current.filter((tab) => tab.sessionId !== sessionId);
      if (next.length === 0) {
        const replacement = makeTab(nodeId, 1);
        setActiveTabId(replacement.sessionId);
        return [replacement];
      }
      if (sessionId === activeTabId) {
        setActiveTabId(next[0].sessionId);
      }
      return next.map((tab, index) => ({ ...tab, order: index }));
    });
  };

  const renameTab = (sessionId: string, newLabel: string) => {
    updateTab(sessionId, (tab) => ({ ...tab, label: newLabel }));
  };

  const resetWorkspace = () => {
    const next = makeTab(nodeId, 1);
    setTabs([next]);
    setActiveTabId(next.sessionId);
    toast({ title: 'Fleet terminal workspace reset', variant: 'success' });
  };

  const reconnectActive = () => {
    if (!activeTab) return;
    const newSessionId = makeSessionId(nodeId);
    setTabs((current) =>
      current.map((tab) =>
        tab.sessionId === activeTab.sessionId
          ? {
              ...tab,
              sessionId: newSessionId,
              started: true,
              status: 'connecting',
              statusMessage: undefined,
              lastActiveAt: new Date().toISOString(),
            }
          : tab
      )
    );
    setActiveTabId(newSessionId);
  };

  const issueCommand = (command: string) => {
    if (!activeTab) return;
    if (!activeTab.started) {
      startTab(activeTab.sessionId);
    }
    setCommandRequest({
      id: ++requestCounterRef.current,
      sessionId: activeTab.sessionId,
      command,
    });
  };

  const issueAction = (action: ActionRequest['action']) => {
    if (!activeTab || !activeTab.started) return;
    setActionRequest({
      id: ++requestCounterRef.current,
      sessionId: activeTab.sessionId,
      action,
    });
  };

  const pasteClipboard = async () => {
    if (!navigator.clipboard?.readText) {
      toast({ title: 'Clipboard paste is unavailable', variant: 'warning' });
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (text) issueCommand(text);
    } catch {
      toast({ title: 'Unable to read clipboard', variant: 'destructive' });
    }
  };

  const notice = useCallback(
    (title: string, variant: 'success' | 'destructive' | 'warning' = 'success') => {
      toast({ title, variant });
    },
    [toast]
  );

  return (
    <Card className="overflow-hidden">
      <TerminalHeader
        nodeId={nodeId}
        tabsCount={tabs.length}
        activeSessions={activeSessions}
        activeTab={activeTab}
        onStartTab={startTab}
        onStopTab={stopTab}
        onReconnect={reconnectActive}
        onResetWorkspace={resetWorkspace}
      />

      <CardContent className="p-0">
        <TerminalTabStrip
          tabs={tabs}
          activeTabId={activeTabId}
          onSetActiveTabId={setActiveTabId}
          onAddTab={addTab}
          onCloseTab={closeTab}
          onRenameTab={renameTab}
          onIssueAction={issueAction}
          onPasteClipboard={pasteClipboard}
          activeTabStarted={activeTab?.started ?? false}
        />

        <QuickCommands onIssueCommand={issueCommand} />

        <TerminalStatusBar activeTab={activeTab} />

        <div className="relative h-[34rem] bg-background">
          {tabs.map((tab) => (
            <div
              key={tab.sessionId}
              className={cn(
                'absolute inset-0',
                tab.sessionId === activeTabId ? 'z-10' : 'z-0 invisible'
              )}
            >
              <FleetTerminalPane
                nodeId={nodeId}
                tab={tab}
                active={tab.sessionId === activeTabId}
                commandRequest={commandRequest}
                actionRequest={actionRequest}
                onStatusChange={updateTabStatus}
                onNotice={notice}
              />
              {!tab.started && (
                <div className="flex h-full items-center justify-center p-6">
                  <div className="max-w-xl text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                      <TerminalIcon className="h-6 w-6" />
                    </div>
                    <p className="font-mono text-sm text-muted-foreground">
                      Click &quot;Start session&quot; to open an interactive shell on node {nodeId}.
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                      <span>Tab state is saved locally for this node.</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default NodeTerminal;
