import type { AgentType, SessionStatus } from '../types';

export const AGENT_TYPES: readonly AgentType[] = [
  'claude-code',
  'codex',
  'opencode',
  'aider',
  'gemini-cli',
  'custom',
] as const;

export const agentIcons: Record<AgentType, string> = {
  'claude-code': 'CC',
  codex: 'CX',
  opencode: 'OC',
  aider: 'AI',
  'gemini-cli': 'GC',
  custom: '??',
};

export const statusColors: Record<SessionStatus, string> = {
  running: 'text-success',
  idle: 'text-warning',
  waiting: 'text-primary',
  error: 'text-destructive',
  completed: 'text-muted-foreground',
};

export const statusBg: Record<SessionStatus, string> = {
  running: 'bg-success/15',
  idle: 'bg-warning/15',
  waiting: 'bg-primary/15',
  error: 'bg-destructive/15',
  completed: 'bg-muted/30',
};

// Polling intervals (ms)
export const PAGE_POLL_INTERVAL_MS = 10_000;
export const WIDGET_POLL_INTERVAL_MS = 15_000;
