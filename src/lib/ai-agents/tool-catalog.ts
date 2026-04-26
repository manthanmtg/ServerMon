import type {
  AgentToolAction,
  AgentToolCommand,
  AgentToolStatus,
  AgentType,
} from '@/modules/ai-agents/types';

export interface AgentToolDefinition {
  type: AgentType;
  name: string;
  description: string;
  defaultModel: string;
  defaultEffort: string;
  defaultMode: string;
  launchCommand: string;
  command?: string;
  packageName?: string;
  latestVersionCommand?: string[];
  capabilities: string[];
  settings: Array<{ label: string; value: string }>;
  actions: Partial<Record<AgentToolAction, AgentToolCommand>>;
}

export interface AgentToolCardModel extends AgentToolDefinition {
  status?: AgentToolStatus;
  sessionCount: number;
  installed: boolean;
  observed: boolean;
  cardStatus: AgentToolCardStatus;
}

type AgentToolCardStatus = 'update-available' | 'installed' | 'not-installed' | 'adapter';

export const AGENT_TOOL_DEFINITIONS: AgentToolDefinition[] = [
  {
    type: 'codex',
    name: 'Codex',
    description: 'OpenAI coding agent sessions discovered from Codex CLI rollout history.',
    defaultModel: 'CLI/config default',
    defaultEffort: 'CLI/config default',
    defaultMode: 'workspace-write or profile default',
    launchCommand: 'codex --model <model> --sandbox <mode>',
    command: 'codex',
    packageName: '@openai/codex',
    latestVersionCommand: ['npm', 'view', '@openai/codex', 'version'],
    capabilities: ['code edits', 'shell commands', 'tool calls', 'session replay'],
    actions: {
      install: {
        label: 'Install Codex',
        description: 'Install the OpenAI Codex CLI globally with npm.',
        command: ['npm', 'install', '-g', '@openai/codex'],
      },
      update: {
        label: 'Update Codex',
        description: 'Update the OpenAI Codex CLI global npm package.',
        command: ['npm', 'install', '-g', '@openai/codex'],
      },
    },
    settings: [
      { label: 'Default model', value: 'CLI/config default; override with --model' },
      {
        label: 'Default reasoning effort',
        value: 'CLI/config default; override via config profile',
      },
      { label: 'Default sandbox', value: 'read-only, workspace-write, or danger-full-access' },
      { label: 'Approval mode', value: 'untrusted, on-request, or never' },
      { label: 'Profile support', value: '~/.codex/config.toml profiles via --profile' },
      { label: 'Web search', value: 'available with --search' },
    ],
  },
  {
    type: 'claude-code',
    name: 'Claude Code',
    description: 'Claude Code sessions parsed from local project conversation history.',
    defaultModel: 'claude-opus-4.5',
    defaultEffort: 'adaptive',
    defaultMode: 'project permissions',
    launchCommand: 'claude',
    command: 'claude',
    packageName: '@anthropic-ai/claude-code',
    latestVersionCommand: ['npm', 'view', '@anthropic-ai/claude-code', 'version'],
    capabilities: ['conversation history', 'tool timeline', 'file edits', 'terminal actions'],
    actions: {
      install: {
        label: 'Install Claude Code',
        description: 'Install Claude Code globally with npm.',
        command: ['npm', 'install', '-g', '@anthropic-ai/claude-code'],
      },
      update: {
        label: 'Update Claude Code',
        description: 'Update the Claude Code global npm package.',
        command: ['npm', 'install', '-g', '@anthropic-ai/claude-code'],
      },
    },
    settings: [
      { label: 'Default model', value: 'claude-opus-4.5' },
      { label: 'Default permission mode', value: 'project permissions' },
      { label: 'Context source', value: '~/.claude/projects' },
      { label: 'Session grouping', value: 'project directory' },
    ],
  },
  {
    type: 'opencode',
    name: 'OpenCode',
    description: 'OpenCode sessions from local storage with command and message traces.',
    defaultModel: 'provider default',
    defaultEffort: 'tool default',
    defaultMode: 'local project',
    launchCommand: 'opencode',
    command: 'opencode',
    capabilities: ['message parsing', 'model detection', 'timeline extraction'],
    actions: {},
    settings: [
      { label: 'Default model', value: 'provider default' },
      { label: 'Storage source', value: '~/.local/share/opencode' },
      { label: 'Command capture', value: 'enabled when present' },
    ],
  },
  {
    type: 'gemini-cli',
    name: 'Gemini CLI',
    description: 'Gemini CLI history with model, thought, and tool-call extraction.',
    defaultModel: 'Gemini CLI default',
    defaultEffort: 'tool default',
    defaultMode: 'trusted workspace or sandbox mode',
    launchCommand: 'gemini --model <model> --approval-mode <mode>',
    command: 'gemini',
    packageName: '@google/gemini-cli',
    latestVersionCommand: ['npm', 'view', '@google/gemini-cli', 'version'],
    capabilities: ['tool calls', 'thought summaries', 'token usage'],
    actions: {
      install: {
        label: 'Install Gemini CLI',
        description: 'Install the Gemini CLI globally with npm.',
        command: ['npm', 'install', '-g', '@google/gemini-cli'],
      },
      update: {
        label: 'Update Gemini CLI',
        description: 'Update the Gemini CLI global npm package.',
        command: ['npm', 'install', '-g', '@google/gemini-cli'],
      },
    },
    settings: [
      { label: 'Default model', value: 'Gemini CLI default; override with --model' },
      { label: 'Approval mode', value: 'default, auto_edit, yolo, or plan' },
      { label: 'Sandbox', value: 'optional via --sandbox' },
      { label: 'Worktree mode', value: 'available via --worktree' },
      { label: 'Extensions', value: 'controlled with --extensions' },
      { label: 'History source', value: '~/.gemini/tmp/.../chats session logs' },
      { label: 'Thought capture', value: 'shown when available' },
    ],
  },
  {
    type: 'aider',
    name: 'Aider',
    description: 'Aider-compatible tracking placeholder for repository-local agent activity.',
    defaultModel: 'configured in aider',
    defaultEffort: 'tool default',
    defaultMode: 'git-aware edits',
    launchCommand: 'aider',
    command: 'aider',
    packageName: 'aider-chat',
    capabilities: ['git-aware sessions', 'file changes', 'command history'],
    actions: {
      install: {
        label: 'Install Aider',
        description: 'Install Aider with pipx so it stays isolated from ServerMon.',
        command: ['pipx', 'install', 'aider-chat'],
      },
      update: {
        label: 'Update Aider',
        description: 'Upgrade the Aider pipx package.',
        command: ['pipx', 'upgrade', 'aider-chat'],
      },
    },
    settings: [
      { label: 'Default model', value: 'configured in aider' },
      { label: 'Repo detection', value: 'git root' },
      { label: 'Change tracking', value: 'file based' },
    ],
  },
  {
    type: 'custom',
    name: 'Custom',
    description: 'Extension point for custom agent adapters and locally-defined tools.',
    defaultModel: 'custom',
    defaultEffort: 'custom',
    defaultMode: 'adapter defined',
    launchCommand: 'custom adapter',
    capabilities: ['adapter hooks', 'custom logs', 'custom metadata'],
    actions: {},
    settings: [
      { label: 'Default model', value: 'adapter defined' },
      { label: 'Command source', value: 'adapter defined' },
      { label: 'Detection mode', value: 'custom implementation' },
    ],
  },
];

export function getAgentToolDefinition(type: AgentType): AgentToolDefinition | undefined {
  return AGENT_TOOL_DEFINITIONS.find((tool) => tool.type === type);
}

export function getAgentToolAction(
  type: AgentType,
  action: AgentToolAction
): AgentToolCommand | undefined {
  return getAgentToolDefinition(type)?.actions[action];
}

export function sortAgentToolCards({
  statuses,
  sessionCounts,
}: {
  statuses: AgentToolStatus[];
  sessionCounts: Map<AgentType, number>;
}): AgentToolCardModel[] {
  const statusByType = new Map(statuses.map((status) => [status.type, status]));
  return AGENT_TOOL_DEFINITIONS.map((tool) => {
    const status = statusByType.get(tool.type);
    const sessionCount = sessionCounts.get(tool.type) ?? 0;
    const installed = tool.command ? Boolean(status?.installed) : true;
    const cardStatus: AgentToolCardStatus = !tool.command
      ? 'adapter'
      : status?.updateAvailable
        ? 'update-available'
        : installed
          ? 'installed'
          : 'not-installed';
    return {
      ...tool,
      status,
      sessionCount,
      installed,
      observed: sessionCount > 0,
      cardStatus,
    };
  }).sort((a, b) => {
    const rank = (tool: AgentToolCardModel) => {
      if (tool.cardStatus === 'adapter') return 5;
      if (tool.cardStatus === 'update-available') return 0;
      if (tool.installed && tool.observed) return 1;
      if (tool.installed) return 2;
      if (tool.observed) return 3;
      return tool.status ? 4 : 4.5;
    };
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    const bySessions = b.sessionCount - a.sessionCount;
    if (bySessions !== 0) return bySessions;
    return a.name.localeCompare(b.name);
  });
}
