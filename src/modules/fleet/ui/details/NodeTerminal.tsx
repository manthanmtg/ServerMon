'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Terminal as XtermTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
  Check,
  Clipboard,
  Copy,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Terminal as TerminalIcon,
  Trash2,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { useTtySession } from '@/modules/fleet/ui/lib/useTtySession';

interface NodeTerminalProps {
  nodeId: string;
}

type FleetTerminalStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

interface FleetTerminalTab {
  sessionId: string;
  label: string;
  order: number;
  status: FleetTerminalStatus;
  statusMessage?: string;
  started: boolean;
  createdAt: string;
  lastActiveAt: string;
}

interface CommandRequest {
  id: number;
  sessionId: string;
  command: string;
}

interface ActionRequest {
  id: number;
  sessionId: string;
  action: 'clear' | 'copy' | 'focus';
}

const QUICK_COMMANDS = [
  { label: 'uptime', command: 'uptime\n' },
  { label: 'disk', command: 'df -h\n' },
  { label: 'memory', command: 'free -h || vm_stat\n' },
  { label: 'ports', command: 'ss -tulpn || netstat -tulpn\n' },
  { label: 'docker', command: 'docker ps\n' },
  { label: 'journal', command: 'journalctl -xe --no-pager | tail -80\n' },
];

function makeSessionId(nodeId: string): string {
  return `fleet-${nodeId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeTab(nodeId: string, index: number, started = false): FleetTerminalTab {
  const now = new Date().toISOString();
  return {
    sessionId: makeSessionId(nodeId),
    label: `Shell ${index}`,
    order: index - 1,
    status: started ? 'connecting' : 'idle',
    started,
    createdAt: now,
    lastActiveAt: now,
  };
}

function storageKey(nodeId: string): string {
  return `servermon:fleet-terminal:${nodeId}:tabs:v1`;
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    if (typeof window.localStorage?.getItem !== 'function') return null;
    if (typeof window.localStorage?.setItem !== 'function') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function isStoredTab(value: unknown): value is FleetTerminalTab {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<FleetTerminalTab>;
  return (
    typeof candidate.sessionId === 'string' &&
    typeof candidate.label === 'string' &&
    typeof candidate.order === 'number'
  );
}

function loadStoredTabs(nodeId: string): { tabs: FleetTerminalTab[]; activeTabId: string | null } {
  const storage = browserStorage();
  if (!storage) {
    const tab = makeTab(nodeId, 1);
    return { tabs: [tab], activeTabId: tab.sessionId };
  }

  try {
    const raw = storage.getItem(storageKey(nodeId));
    if (!raw) {
      const tab = makeTab(nodeId, 1);
      return { tabs: [tab], activeTabId: tab.sessionId };
    }
    const parsed = JSON.parse(raw) as { tabs?: unknown; activeTabId?: unknown };
    const tabs = Array.isArray(parsed.tabs)
      ? parsed.tabs.filter(isStoredTab).map((tab, index) => ({
          ...tab,
          order: index,
          status: tab.started ? ('connecting' as const) : ('idle' as const),
          started: Boolean(tab.started),
          createdAt: tab.createdAt || new Date().toISOString(),
          lastActiveAt: tab.lastActiveAt || new Date().toISOString(),
        }))
      : [];
    if (tabs.length === 0) {
      const tab = makeTab(nodeId, 1);
      return { tabs: [tab], activeTabId: tab.sessionId };
    }
    const activeTabId =
      typeof parsed.activeTabId === 'string' &&
      tabs.some((tab) => tab.sessionId === parsed.activeTabId)
        ? parsed.activeTabId
        : tabs[0].sessionId;
    return { tabs, activeTabId };
  } catch {
    const tab = makeTab(nodeId, 1);
    return { tabs: [tab], activeTabId: tab.sessionId };
  }
}

function statusVariant(
  status: FleetTerminalStatus
): 'secondary' | 'success' | 'warning' | 'destructive' {
  if (status === 'connected') return 'success';
  if (status === 'connecting') return 'warning';
  if (status === 'error' || status === 'disconnected') return 'destructive';
  return 'secondary';
}

function statusLabel(tab: FleetTerminalTab | null): string {
  const status = tab?.status ?? 'idle';
  if (status === 'error' && tab?.statusMessage) return tab.statusMessage;
  if (status === 'connected') return 'Connected';
  if (status === 'connecting') return 'Connecting';
  if (status === 'disconnected') return 'Disconnected';
  if (status === 'error') return 'Error';
  return 'Ready';
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

interface FleetTerminalPaneProps {
  nodeId: string;
  tab: FleetTerminalTab;
  active: boolean;
  commandRequest: CommandRequest | null;
  actionRequest: ActionRequest | null;
  onStatusChange: (sessionId: string, status: FleetTerminalStatus, message?: string) => void;
  onNotice: (title: string, variant?: 'success' | 'destructive' | 'warning') => void;
}

function FleetTerminalPane({
  nodeId,
  tab,
  active,
  commandRequest,
  actionRequest,
  onStatusChange,
  onNotice,
}: FleetTerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XtermTerminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sentCommandRequestRef = useRef<number | null>(null);
  const handledActionRequestRef = useRef<number | null>(null);
  const sendRef = useRef<(data: string) => void>(() => {});
  const resizeRef = useRef<(cols: number, rows: number) => void>(() => {});

  const session = useTtySession({
    nodeId,
    sessionId: tab.sessionId,
    cols: 100,
    rows: 30,
    enabled: tab.started,
    onData: (data) => termRef.current?.write(data),
    onReady: () => onStatusChange(tab.sessionId, 'connected'),
    onExit: (info) => {
      termRef.current?.writeln(
        `\r\n\u001b[33m[session ended: code=${info.exitCode} signal=${info.signal}]\u001b[0m`
      );
      onStatusChange(tab.sessionId, 'disconnected');
    },
    onError: (message) => {
      termRef.current?.writeln(`\r\n\u001b[31m[error: ${message}]\u001b[0m`);
      onStatusChange(tab.sessionId, 'error', message);
    },
  });

  useEffect(() => {
    sendRef.current = session.send;
    resizeRef.current = session.resize;
  }, [session.send, session.resize]);

  useEffect(() => {
    if (!tab.started) return;
    if (session.connected) {
      onStatusChange(tab.sessionId, 'connected');
    } else if (!session.connected && session.error) {
      onStatusChange(tab.sessionId, 'error', session.error);
    }
  }, [onStatusChange, session.connected, session.error, session.ready, tab.sessionId, tab.started]);

  useEffect(() => {
    if (!tab.started || !containerRef.current) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    const init = async (): Promise<void> => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ]);
      if (disposed || !containerRef.current) return;

      const term = new Terminal({
        convertEol: true,
        cursorBlink: true,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 13,
        scrollback: 8000,
        allowProposedApi: true,
        theme: {
          background: cssVar('--background', '#020617'),
          foreground: cssVar('--foreground', '#f8fafc'),
          cursor: cssVar('--primary', '#6366f1'),
          selectionBackground: `${cssVar('--primary', '#6366f1')}40`,
          black: cssVar('--background', '#020617'),
          red: cssVar('--destructive', '#ef4444'),
          green: cssVar('--success', '#22c55e'),
          yellow: cssVar('--warning', '#eab308'),
          blue: cssVar('--primary', '#6366f1'),
          magenta: cssVar('--accent', '#334155'),
          cyan: cssVar('--primary', '#6366f1'),
          white: cssVar('--foreground', '#f8fafc'),
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current);
      fit.fit();
      term.focus();
      term.onData((data) => sendRef.current(data));
      term.onResize(({ cols, rows }) => resizeRef.current(cols, rows));

      termRef.current = term;
      fitRef.current = fit;

      const fitSoon = (): void => {
        requestAnimationFrame(() => fit.fit());
      };
      const resizeObserver = new ResizeObserver(fitSoon);
      resizeObserver.observe(containerRef.current);
      window.addEventListener('resize', fitSoon);

      cleanup = () => {
        window.removeEventListener('resize', fitSoon);
        resizeObserver.disconnect();
        term.dispose();
        if (termRef.current === term) termRef.current = null;
        if (fitRef.current === fit) fitRef.current = null;
      };
    };

    init().catch(() => onStatusChange(tab.sessionId, 'error'));

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [onStatusChange, tab.sessionId, tab.started]);

  useEffect(() => {
    if (active) {
      requestAnimationFrame(() => {
        fitRef.current?.fit();
        termRef.current?.focus();
      });
    }
  }, [active]);

  useEffect(() => {
    if (!commandRequest || commandRequest.sessionId !== tab.sessionId) return;
    if (sentCommandRequestRef.current === commandRequest.id) return;
    sentCommandRequestRef.current = commandRequest.id;
    sendRef.current(commandRequest.command);
    termRef.current?.focus();
  }, [commandRequest, tab.sessionId]);

  useEffect(() => {
    if (!actionRequest || actionRequest.sessionId !== tab.sessionId) return;
    if (handledActionRequestRef.current === actionRequest.id) return;
    handledActionRequestRef.current = actionRequest.id;

    if (actionRequest.action === 'clear') {
      termRef.current?.clear();
      termRef.current?.focus();
      return;
    }
    if (actionRequest.action === 'focus') {
      termRef.current?.focus();
      return;
    }
    const selection = termRef.current?.getSelection();
    if (!selection) {
      onNotice('No terminal selection to copy', 'warning');
      return;
    }
    navigator.clipboard
      ?.writeText(selection)
      .then(() => onNotice('Selection copied', 'success'))
      .catch(() => onNotice('Unable to copy selection', 'destructive'));
  }, [actionRequest, onNotice, tab.sessionId]);

  if (!tab.started) return null;

  return (
    <div
      ref={containerRef}
      data-testid="fleet-terminal-container"
      className="h-full w-full overflow-hidden p-2"
      style={{ backgroundColor: 'var(--background)' }}
    />
  );
}

export function NodeTerminal({ nodeId }: NodeTerminalProps) {
  const initialWorkspace = useMemo(() => loadStoredTabs(nodeId), [nodeId]);
  const [tabs, setTabs] = useState<FleetTerminalTab[]>(initialWorkspace.tabs);
  const [activeTabId, setActiveTabId] = useState<string | null>(initialWorkspace.activeTabId);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [commandRequest, setCommandRequest] = useState<CommandRequest | null>(null);
  const [actionRequest, setActionRequest] = useState<ActionRequest | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);
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

  const startRename = (tab: FleetTerminalTab) => {
    setEditingTabId(tab.sessionId);
    setEditLabel(tab.label);
    setTimeout(() => editInputRef.current?.focus(), 30);
  };

  const commitRename = (sessionId: string) => {
    const trimmed = editLabel.trim();
    if (trimmed) {
      updateTab(sessionId, (tab) => ({ ...tab, label: trimmed.slice(0, 28) }));
    }
    setEditingTabId(null);
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
                <span>{tabs.length} tabs</span>
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
                (activeTab.started ? stopTab(activeTab.sessionId) : startTab(activeTab.sessionId))
              }
              disabled={!activeTab}
            >
              <Play className="h-3.5 w-3.5" />
              {activeTab?.started ? 'End session' : 'Start session'}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={reconnectActive}
              disabled={!activeTab}
              title="Reconnect"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={resetWorkspace} title="Reset workspace">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="flex flex-col border-b border-border bg-card/80 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto p-2">
            {tabs.map((tab) => (
              <div
                key={tab.sessionId}
                role="button"
                tabIndex={0}
                onClick={() => setActiveTabId(tab.sessionId)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setActiveTabId(tab.sessionId);
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
                    <button
                      type="submit"
                      className="rounded p-0.5 hover:bg-white/10"
                      title="Save name"
                    >
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
                    closeTab(tab.sessionId);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      event.stopPropagation();
                      closeTab(tab.sessionId);
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
              onClick={addTab}
              title="New tab"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-t border-border p-2 xl:border-l xl:border-t-0">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => issueAction('copy')}
              disabled={!activeTab?.started}
              title="Copy selection"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={pasteClipboard}
              disabled={!activeTab}
              title="Paste"
            >
              <Clipboard className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => issueAction('clear')}
              disabled={!activeTab?.started}
              title="Clear"
            >
              <Zap className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto border-b border-border bg-secondary/10 px-3 py-2">
          {QUICK_COMMANDS.map((item) => (
            <Button
              key={item.label}
              size="sm"
              variant="ghost"
              className="shrink-0 font-mono"
              onClick={() => issueCommand(item.command)}
            >
              {item.label}
            </Button>
          ))}
        </div>

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
