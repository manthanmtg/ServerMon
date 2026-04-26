'use client';

import { useMemo, useState } from 'react';
import { Bot, CheckCircle2, Settings2, SlidersHorizontal, Terminal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AgentSession, AgentType, AgentsSnapshot } from '../../types';
import { agentIcons } from '../constants';

interface ToolDefinition {
  type: AgentType;
  name: string;
  description: string;
  defaultModel: string;
  defaultEffort: string;
  defaultMode: string;
  launchCommand: string;
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

  const activeToolCount = TOOL_DEFINITIONS.filter((tool) =>
    observedToolTypes.has(tool.type)
  ).length;
  const activeSessionCount = snapshot?.sessions.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ToolMetric label="Available tools" value={TOOL_DEFINITIONS.length} />
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
              const isSelected = selectedType === tool.type;
              return (
                <button
                  key={tool.type}
                  type="button"
                  onClick={() => setSelectedType(tool.type)}
                  className={`text-left rounded-xl border bg-card p-4 transition-colors hover:border-primary/60 ${
                    isSelected ? 'border-primary shadow-sm' : 'border-border'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 shrink-0 rounded-lg bg-secondary text-sm font-bold flex items-center justify-center">
                        {agentIcons[tool.type]}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold">{tool.name}</h3>
                        <p className="text-xs text-muted-foreground truncate">
                          {latestModel(sessions, tool.defaultModel)}
                        </p>
                      </div>
                    </div>
                    <Badge variant={sessions.length ? 'default' : 'secondary'}>
                      {sessions.length ? `${sessions.length} seen` : 'ready'}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{tool.description}</p>
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

        <ToolSettings tool={selectedTool} sessions={selectedSessions} />
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

function ToolSettings({ tool, sessions }: { tool: ToolDefinition; sessions: AgentSession[] }) {
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
              <Settings2 className="h-5 w-5" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
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
