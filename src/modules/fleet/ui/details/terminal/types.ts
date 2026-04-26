'use client';

export type FleetTerminalStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

export interface FleetTerminalTab {
  sessionId: string;
  label: string;
  order: number;
  status: FleetTerminalStatus;
  statusMessage?: string;
  started: boolean;
  createdAt: string;
  lastActiveAt: string;
}

export interface CommandRequest {
  id: number;
  sessionId: string;
  command: string;
}

export interface ActionRequest {
  id: number;
  sessionId: string;
  action: 'clear' | 'copy' | 'focus';
}

export const QUICK_COMMANDS = [
  { label: 'uptime', command: 'uptime\n' },
  { label: 'disk', command: 'df -h\n' },
  { label: 'memory', command: 'free -h || vm_stat\n' },
  { label: 'ports', command: 'ss -tulpn || netstat -tulpn\n' },
  { label: 'docker', command: 'docker ps\n' },
  { label: 'journal', command: 'journalctl -xe --no-pager | tail -80\n' },
];

export function makeSessionId(nodeId: string): string {
  return `fleet-${nodeId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makeTab(nodeId: string, index: number, started = false): FleetTerminalTab {
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

export function storageKey(nodeId: string): string {
  return `servermon:fleet-terminal:${nodeId}:tabs:v1`;
}

export function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    if (typeof window.localStorage?.getItem !== 'function') return null;
    if (typeof window.localStorage?.setItem !== 'function') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function statusVariant(
  status: FleetTerminalStatus
): 'secondary' | 'success' | 'warning' | 'destructive' {
  if (status === 'connected') return 'success';
  if (status === 'connecting') return 'warning';
  if (status === 'error' || status === 'disconnected') return 'destructive';
  return 'secondary';
}

export function statusLabel(tab: FleetTerminalTab | null): string {
  const status = tab?.status ?? 'idle';
  if (status === 'error' && tab?.statusMessage) return tab.statusMessage;
  if (status === 'connected') return 'Connected';
  if (status === 'connecting') return 'Connecting';
  if (status === 'disconnected') return 'Disconnected';
  if (status === 'error') return 'Error';
  return 'Ready';
}

export function isStoredTab(value: unknown): value is FleetTerminalTab {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<FleetTerminalTab>;
  return (
    typeof candidate.sessionId === 'string' &&
    typeof candidate.label === 'string' &&
    typeof candidate.order === 'number'
  );
}

export function loadStoredTabs(nodeId: string): { tabs: FleetTerminalTab[]; activeTabId: string | null } {
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

export function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
