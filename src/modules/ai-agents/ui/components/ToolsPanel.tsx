'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Download,
  PackageCheck,
  RefreshCcw,
  Terminal,
  X,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  getAgentToolAction,
  sortAgentToolCards,
  type AgentToolCardModel,
} from '@/lib/ai-agents/tool-catalog';
import { cn } from '@/lib/utils';
import type {
  AgentSession,
  AgentToolAction,
  AgentToolJob,
  AgentToolStatus,
  AgentType,
  AgentsSnapshot,
} from '../../types';
import { agentIcons } from '../constants';

const JOBS_ENDPOINT = '/api/modules/ai-agents/tools/jobs';

function sessionsForTool(snapshot: AgentsSnapshot | null, type: AgentType): AgentSession[] {
  return [...(snapshot?.sessions ?? []), ...(snapshot?.pastSessions ?? [])].filter(
    (session) => session.agent.type === type
  );
}

function latestModel(sessions: AgentSession[], fallback: string): string {
  return sessions.find((session) => session.agent.model)?.agent.model ?? fallback;
}

function statusLabel(tool: AgentToolCardModel): string {
  if (tool.cardStatus === 'adapter') return 'adapter';
  if (tool.cardStatus === 'update-available') return 'update available';
  if (tool.sessionCount > 0) return `${tool.sessionCount} seen`;
  if (tool.installed) return 'installed';
  return 'not installed';
}

function primaryActionFor(tool: AgentToolCardModel): AgentToolAction | null {
  if (!tool.command) return null;
  return tool.installed ? 'update' : 'install';
}

function commandText(command?: string[]): string {
  return command?.join(' ') ?? 'No command configured';
}

async function fetchToolJobs(): Promise<AgentToolJob[]> {
  const res = await fetch(JOBS_ENDPOINT, { cache: 'no-store' });
  if (!res.ok) return [];
  const data = (await res.json()) as { jobs?: AgentToolJob[] };
  return data.jobs ?? [];
}

export function ToolsPanel({ snapshot }: { snapshot: AgentsSnapshot | null }) {
  const [selectedType, setSelectedType] = useState<AgentType | null>(null);

  const sessionCounts = useMemo(() => {
    const counts = new Map<AgentType, number>();
    for (const session of [...(snapshot?.sessions ?? []), ...(snapshot?.pastSessions ?? [])]) {
      counts.set(session.agent.type, (counts.get(session.agent.type) ?? 0) + 1);
    }
    return counts;
  }, [snapshot]);

  const cards = useMemo(
    () => sortAgentToolCards({ statuses: snapshot?.tools ?? [], sessionCounts }),
    [snapshot, sessionCounts]
  );

  const selectedTool = cards.find((tool) => tool.type === selectedType) ?? null;
  const installedToolCount = cards.filter((tool) => tool.command && tool.installed).length;
  const configuredToolCount = cards.filter((tool) => tool.observed).length;
  const updateCount = cards.filter((tool) => tool.cardStatus === 'update-available').length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ToolMetric label="Installed tools" value={installedToolCount} icon="package" />
        <ToolMetric label="Configured tools" value={configuredToolCount} icon="bot" />
        <ToolMetric label="Updates available" value={updateCount} icon="refresh" />
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Tool Catalog</h2>
          <p className="text-sm text-muted-foreground">
            Manage detected agent tools, updates, capabilities, and recent usage.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {cards.map((tool) => (
            <ToolCard
              key={tool.type}
              tool={tool}
              sessions={sessionsForTool(snapshot, tool.type)}
              onOpen={() => setSelectedType(tool.type)}
            />
          ))}
        </div>
      </section>

      {selectedTool ? (
        <ToolModal
          tool={selectedTool}
          sessions={sessionsForTool(snapshot, selectedTool.type)}
          status={selectedTool.status}
          onClose={() => setSelectedType(null)}
        />
      ) : null}
    </div>
  );
}

function ToolMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: 'bot' | 'package' | 'refresh';
}) {
  const Icon = icon === 'package' ? PackageCheck : icon === 'refresh' ? RefreshCcw : Bot;
  return (
    <Card className="border-border/60">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xl font-bold leading-none">{value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ToolCard({
  tool,
  sessions,
  onOpen,
}: {
  tool: AgentToolCardModel;
  sessions: AgentSession[];
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'text-left rounded-xl border p-4 min-h-[190px] transition-colors bg-card hover:border-primary/60',
        tool.cardStatus === 'not-installed' && 'bg-muted/30 text-muted-foreground',
        tool.cardStatus === 'update-available' && 'border-primary shadow-sm',
        tool.cardStatus !== 'update-available' && 'border-border'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              'h-10 w-10 shrink-0 rounded-lg text-sm font-bold flex items-center justify-center',
              tool.installed ? 'bg-secondary' : 'bg-primary/10 text-primary'
            )}
          >
            {agentIcons[tool.type]}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold">{tool.name}</h3>
            <p className="text-xs text-muted-foreground truncate">
              {latestModel(sessions, tool.status?.version ?? tool.defaultModel)}
            </p>
          </div>
        </div>
        <Badge
          variant={
            tool.cardStatus === 'update-available'
              ? 'default'
              : tool.installed
                ? 'secondary'
                : 'outline'
          }
        >
          {statusLabel(tool)}
        </Badge>
      </div>

      <p className="mt-3 text-sm text-muted-foreground line-clamp-3">{tool.description}</p>
      {tool.status?.latestVersion && tool.status.updateAvailable ? (
        <p className="mt-2 text-xs text-primary">
          Latest {tool.status.latestVersion}; installed {tool.status.version ?? 'unknown'}
        </p>
      ) : null}
      {!tool.installed && tool.command ? (
        <p className="mt-2 text-xs text-primary">Install or expose `{tool.command}` on PATH.</p>
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
}

function ToolModal({
  tool,
  sessions,
  status,
  onClose,
}: {
  tool: AgentToolCardModel;
  sessions: AgentSession[];
  status: AgentToolStatus | undefined;
  onClose: () => void;
}) {
  const [jobs, setJobs] = useState<AgentToolJob[]>([]);
  const [startingAction, setStartingAction] = useState<AgentToolAction | null>(null);
  const action = primaryActionFor(tool);
  const configuredAction = action ? getAgentToolAction(tool.type, action) : undefined;
  const activeJob = jobs.find((job) => job.toolType === tool.type);
  const hasRunningJob = activeJob?.status === 'running' || activeJob?.status === 'queued';

  const refreshJobs = useCallback(async () => {
    const nextJobs = await fetchToolJobs();
    setJobs(nextJobs.filter((job) => job.toolType === tool.type));
  }, [tool.type]);

  useEffect(() => {
    void refreshJobs();
  }, [refreshJobs]);

  useEffect(() => {
    if (!hasRunningJob) return;
    const interval = window.setInterval(() => {
      void refreshJobs();
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [hasRunningJob, refreshJobs]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const startAction = useCallback(
    async (nextAction: AgentToolAction) => {
      setStartingAction(nextAction);
      try {
        const res = await fetch(JOBS_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toolType: tool.type, action: nextAction }),
        });
        if (res.ok) {
          const data = (await res.json()) as { job: AgentToolJob };
          setJobs((current) => [data.job, ...current.filter((job) => job.id !== data.job.id)]);
          await refreshJobs();
        }
      } finally {
        setStartingAction(null);
      }
    },
    [refreshJobs, tool.type]
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="tool-modal-title"
        className="relative max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-11 w-11 shrink-0 rounded-lg bg-secondary flex items-center justify-center font-bold">
              {agentIcons[tool.type]}
            </div>
            <div className="min-w-0">
              <h3 id="tool-modal-title" className="text-lg font-semibold">
                {tool.name}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant={tool.cardStatus === 'update-available' ? 'default' : 'secondary'}>
                  {statusLabel(tool)}
                </Badge>
                {status?.latestVersion ? (
                  <Badge variant="outline">latest {status.latestVersion}</Badge>
                ) : null}
              </div>
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="max-h-[calc(90vh-88px)] overflow-y-auto p-5 space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)] gap-4">
            <section className="space-y-4">
              <InfoGrid tool={tool} status={status} />
              <ActionPanel
                tool={tool}
                action={action}
                command={configuredAction?.command}
                disabled={startingAction !== null || hasRunningJob || !configuredAction}
                loading={startingAction !== null}
                onRun={startAction}
              />
              <ConsolePanel job={activeJob} />
            </section>
            <section className="space-y-4">
              <SettingsPanel tool={tool} />
              <SessionsPanel tool={tool} sessions={sessions} />
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}

function InfoGrid({
  tool,
  status,
}: {
  tool: AgentToolCardModel;
  status: AgentToolStatus | undefined;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <InfoTile
        label={tool.installed ? 'Command path' : 'Missing command'}
        value={status?.path ?? status?.error ?? 'Not detected'}
      />
      <InfoTile label="Current version" value={status?.version ?? 'Unknown'} />
      <InfoTile label="Default launch mode" value={tool.defaultMode} />
      <InfoTile label="Launch command" value={tool.launchCommand} />
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium break-words">{value}</p>
    </div>
  );
}

function ActionPanel({
  tool,
  action,
  command,
  disabled,
  loading,
  onRun,
}: {
  tool: AgentToolCardModel;
  action: AgentToolAction | null;
  command?: string[];
  disabled: boolean;
  loading: boolean;
  onRun: (action: AgentToolAction) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">Install / Update</h4>
          <p className="text-xs text-muted-foreground">
            The command runs in the background and output stays available here.
          </p>
        </div>
        {action ? (
          <Button
            type="button"
            onClick={() => onRun(action)}
            disabled={disabled}
            loading={loading}
            variant={tool.installed ? 'default' : 'secondary'}
          >
            {tool.installed ? <RefreshCcw className="h-4 w-4" /> : <Download className="h-4 w-4" />}
            {tool.installed ? 'Update' : 'Install'}
          </Button>
        ) : null}
      </div>
      <div className="rounded-lg border border-border bg-background p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Terminal className="h-3.5 w-3.5" />
          Command preview
        </div>
        <p className="mt-2 break-all font-mono text-xs">{commandText(command)}</p>
      </div>
    </div>
  );
}

function ConsolePanel({ job }: { job?: AgentToolJob }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">Console</h4>
        <Badge
          variant={
            job?.status === 'succeeded'
              ? 'default'
              : job?.status === 'failed'
                ? 'destructive'
                : 'secondary'
          }
        >
          {job?.status ?? 'no jobs yet'}
        </Badge>
      </div>
      <pre className="mt-3 min-h-[220px] max-h-[360px] overflow-auto rounded-lg border border-border bg-muted/30 p-3 text-xs whitespace-pre-wrap">
        {job?.output ?? 'Start an install or update to stream output here.'}
      </pre>
      {job?.exitCode !== undefined ? (
        <p className="mt-2 text-xs text-muted-foreground">Exit code {job.exitCode}</p>
      ) : null}
    </div>
  );
}

function SettingsPanel({ tool }: { tool: AgentToolCardModel }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <h4 className="text-sm font-semibold">{tool.name} Settings</h4>
      <div className="mt-3 grid grid-cols-1 gap-2">
        {tool.settings.map((setting) => (
          <InfoTile key={setting.label} label={setting.label} value={setting.value} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {tool.capabilities.map((capability) => (
          <Badge key={capability} variant="secondary">
            {capability}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function SessionsPanel({ tool, sessions }: { tool: AgentToolCardModel; sessions: AgentSession[] }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <h4 className="text-sm font-semibold">Recent {tool.name} Sessions</h4>
      <div className="mt-3 space-y-2">
        {sessions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No sessions detected for this tool yet.
          </div>
        ) : (
          sessions.slice(0, 4).map((session) => (
            <div
              key={session.id}
              className="rounded-lg border border-border bg-background p-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{session.agent.displayName}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {session.environment.repository ?? session.environment.workingDirectory}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {session.status === 'error' ? (
                  <XCircle className="h-4 w-4 text-destructive" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                )}
                <Badge variant={session.status === 'running' ? 'default' : 'secondary'}>
                  {session.status}
                </Badge>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
