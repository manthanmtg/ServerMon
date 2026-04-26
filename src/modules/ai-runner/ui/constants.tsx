import type { ComponentType, ReactNode } from 'react';
import {
  Bot,
  CalendarClock,
  FolderOpen,
  History,
  ListChecks,
  Play,
  Save,
  Settings2,
  Sparkles,
  TerminalSquare,
  Zap,
} from 'lucide-react';
import type { ProfileFormState, IconPresetKey, ViewTab } from './types';

export const TAB_META: Array<{ id: ViewTab; label: string; icon: ReactNode }> = [
  { id: 'run', label: 'Run', icon: <Play className="w-4 h-4" /> },
  { id: 'prompts', label: 'Saved Prompts', icon: <Save className="w-4 h-4" /> },
  { id: 'schedules', label: 'Schedules', icon: <CalendarClock className="w-4 h-4" /> },
  { id: 'autoflows', label: 'AutoFlow', icon: <ListChecks className="w-4 h-4" /> },
  { id: 'history', label: 'History', icon: <History className="w-4 h-4" /> },
  { id: 'logs', label: 'Logs', icon: <TerminalSquare className="w-4 h-4" /> },
  { id: 'settings', label: 'Settings', icon: <Settings2 className="w-4 h-4" /> },
];

export const DEFAULT_PROFILE_FORM: ProfileFormState = {
  name: '',
  slug: '',
  agentType: 'codex',
  invocationTemplate: 'codex --dangerously-bypass-approvals-and-sandbox "$PROMPT"',
  defaultTimeout: 30,
  maxTimeout: 120,
  shell: '/bin/bash',
  requiresTTY: false,
  env: {},
  enabled: true,
  icon: '',
};

export const ICON_PRESETS: Array<{
  key: IconPresetKey;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { key: 'bot', label: 'Bot', icon: Bot },
  { key: 'zap', label: 'Zap', icon: Zap },
  { key: 'terminal', label: 'Terminal', icon: TerminalSquare },
  { key: 'calendar', label: 'Calendar', icon: CalendarClock },
  { key: 'history', label: 'History', icon: History },
  { key: 'folder', label: 'Folder', icon: FolderOpen },
  { key: 'settings', label: 'Settings', icon: Settings2 },
  { key: 'sparkles', label: 'Sparkles', icon: Sparkles },
];
