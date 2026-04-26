'use client';

import { useMemo, useState } from 'react';
import { Bot, CheckCircle2, Settings2, SlidersHorizontal, Terminal, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AgentSession, AgentToolStatus, AgentType, AgentsSnapshot } from '../../types';
import { agentIcons } from '../constants';

interface ToolDefinition {
  type: AgentType;
  name: string;
  description: string;
  defaultModel: string;
  defaultEffort: string;
  defaultMode: string;
  launchCommand: string;
  command?: string;
  capabilities: string[];
  settings: Array<{ label: string; value: string }>;
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'codex',
    name: 'Codex',
    description: 'OpenAI coding agent sessions discovered from Codex CLI rollout history.',
    defaultModel: 'CLI/config default',
    defaultEffort: 'CLI/config default',
    defaultMode: 'workspace-write or profile default',
    launchCommand: 'codex --model <model> --sandbox <mode>',
    command: 'codex',
    capabilities: ['code edits', 'shell commands', 'tool calls', 'session replay'],
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
    capabilities: ['conversation history', 'tool timeline', 'file edits', 'terminal actions'],
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
    capabilities: ['tool calls', 'thought summaries', 'token usage'],
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
    capabilities: ['git-aware sessions', 'file changes', 'command history'],
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
    settings: [
      { label: 'Default model', value: 'adapter defined' },
      { label: 'Command source', value: 'adapter defined' },
      { label: 'Detection mode', value: 'custom implementation' },
    ],
  },
];

function sessionsForTool(snapshot: AgentsSnapshot | null, type: AgentType): AgentSession[] {
  return [...(snapshot?.sessions ?? []), ...(snapshot?.pastSessions ?? [])].filter(
    (session) => session.agent.type === type
  );
}

function latestModel(sessions: AgentSession[], fallback: string): string {
  return sessions.find((session) => session.agent.model)?.agent.model ?? fallback;
}

function statusForTool(
  snapshot: AgentsSnapshot | null,
  tool: ToolDefinition
): AgentToolStatus | undefined {
  return snapshot?.tools.find((status) => status.type === tool.type);
}

function toolIsInstalled(status: AgentToolStatus | undefined, tool: ToolDefinition): boolean {
  if (!tool.command) return true;
  return status?.installed ?? false;
}

function toolStatusLabel(
  status: AgentToolStatus | undefined,
  tool: ToolDefinition,
  sessionCount: number
): string {
  if (!tool.command) return 'adapter';
  if (!status) return 'checking';
  if (!status.installed) return 'not installed';
  if (sessionCount > 0) return `${sessionCount} seen`;
  return status.installed ? 'installed' : 'not installed';
}

export function ToolsPanel({ snapshot }: { snapshot: AgentsSnapshot | null }) {
  const [selectedType, setSelectedType] = useState<AgentType>('codex');

  const observedToolTypes = useMemo(() => {
    return new Set(
      [...(snapshot?.sessions ?? []), ...(snapshot?.pastSessions ?? [])].map(
        (session) => session.agent.type
      )
    );
  }, [snapshot]);

  const selectedTool =
    TOOL_DEFINITIONS.find((tool) => tool.type === selectedType) ?? TOOL_DEFINITIONS[0];
  const selectedSessions = sessionsForTool(snapshot, selectedTool.type);

  const installedToolCount = TOOL_DEFINITIONS.filter((tool) => {
    const status = statusForTool(snapshot, tool);
    return Boolean(tool.command && status?.installed);
  }).length;
  const activeToolCount = TOOL_DEFINITIONS.filter((tool) =>
    observedToolTypes.has(tool.type)
  ).length;
  const activeSessionCount = snapshot?.sessions.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ToolMetric label="Installed tools" value={installedToolCount} />
        <ToolMetric label="Configured tools" value={activeToolCount} />
        <ToolMetric label="Active sessions" value={activeSessionCount} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] gap-4">
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">Tool Catalog</h2>
            <p className="text-sm text-muted-foreground">
              Review detected agent tools, defaults, capabilities, and recent usage.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {TOOL_DEFINITIONS.map((tool) => {
              const sessions = sessionsForTool(snapshot, tool.type);
              const status = statusForTool(snapshot, tool);
              const isInstalled = toolIsInstalled(status, tool);
              const isSelected = selectedType === tool.type;
              return (
                <button
                  key={tool.type}
                  type="button"
                  onClick={() => setSelectedType(tool.type)}
                  className={`text-left rounded-xl border p-4 transition-colors ${
                    isInstalled
                      ? 'bg-card hover:border-primary/60'
                      : 'bg-primary/5 text-muted-foreground hover:border-primary/50'
                  } ${
                    isSelected
                      ? isInstalled
                        ? 'border-primary shadow-sm'
                        : 'border-primary/70 shadow-sm'
                      : 'border-border'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`h-10 w-10 shrink-0 rounded-lg text-sm font-bold flex items-center justify-center ${
                          isInstalled ? 'bg-secondary' : 'bg-primary/10 text-primary'
                        }`}
                      >
                        {agentIcons[tool.type]}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold">{tool.name}</h3>
                        <p className="text-xs text-muted-foreground truncate">
                          {latestModel(sessions, tool.defaultModel)}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={
                        isInstalled ? (sessions.length ? 'default' : 'secondary') : 'outline'
                      }
                    >
                      {toolStatusLabel(status, tool, sessions.length)}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{tool.description}</p>
                  {!isInstalled && tool.command ? (
                    <p className="mt-2 text-xs text-primary">
                      Install or expose `{tool.command}` on PATH to enable this tool.
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {tool.capabilities.slice(0, 3).map((capability) => (
                      <Badge key={capability} variant="outline">
                        {capability}
                      </Badge>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <ToolSettings
          tool={selectedTool}
          sessions={selectedSessions}
          status={statusForTool(snapshot, selectedTool)}
        />
      </div>
    </div>
  );
}

function ToolMetric({ label, value }: { label: string; value: number }) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center">
          <Bot className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xl font-bold leading-none">{value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ToolSettings({
  tool,
  sessions,
  status,
}: {
  tool: ToolDefinition;
  sessions: AgentSession[];
  status: AgentToolStatus | undefined;
}) {
  const isInstalled = toolIsInstalled(status, tool);

  return (
    <section className="space-y-3">
      <Card className="border-border/60">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>{tool.name} Settings</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              {isInstalled ? <Settings2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {tool.command ? (
            <div
              className={`rounded-lg border p-3 ${
                isInstalled
                  ? 'border-border bg-muted/20'
                  : 'border-primary/30 bg-primary/5 text-muted-foreground'
              }`}
            >
              <p className="text-xs">{isInstalled ? 'Installed command' : 'Missing command'}</p>
              <p className="mt-1 text-sm font-medium">
                {isInstalled
                  ? `${status?.command ?? tool.command}${status?.path ? ` at ${status.path}` : ''}`
                  : `${tool.command}: command not found`}
              </p>
              {status?.version ? (
                <p className="mt-1 text-xs text-muted-foreground">{status.version}</p>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tool.settings.map((setting) => (
              <div key={setting.label} className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">{setting.label}</p>
                <p className="mt-1 text-sm font-medium">{setting.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Default launch mode
              </div>
              <p className="mt-1 text-sm font-medium">{tool.defaultMode}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Terminal className="h-3.5 w-3.5" />
                Launch command
              </div>
              <p className="mt-1 text-sm font-medium">{tool.launchCommand}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-2">Capabilities</p>
            <div className="flex flex-wrap gap-1.5">
              {tool.capabilities.map((capability) => (
                <Badge key={capability} variant="secondary">
                  {capability}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle>Recent {tool.name} Sessions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {sessions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              No sessions detected for this tool yet.
            </div>
          ) : (
            sessions.slice(0, 4).map((session) => (
              <div
                key={session.id}
                className="rounded-lg border border-border bg-muted/20 p-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{session.agent.displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {session.environment.repository ?? session.environment.workingDirectory}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <Badge variant={session.status === 'running' ? 'default' : 'secondary'}>
                    {session.status}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}
