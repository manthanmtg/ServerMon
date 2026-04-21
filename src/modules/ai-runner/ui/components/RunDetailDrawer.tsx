'use client';

import { Cpu, ExternalLink, History, PanelRightOpen, Play, RefreshCcw, Square, X, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AIRunnerRunDTO } from '../../types';
import type { HistoryDetailSection } from '../types';
import {
  formatDateTime,
  formatDuration,
  formatMemory,
  getRunStatusVariant,
} from '../utils';

export function RunDetailDrawer({
  run,
  historyDetailSection,
  onSectionChange,
  onClose,
  onRerun,
  onKill,
  onOpenPrompt,
  onOpenSchedule,
  getRunDisplayName,
  profileName,
  promptSourceName,
  scheduleName,
}: {
  run: AIRunnerRunDTO;
  historyDetailSection: HistoryDetailSection;
  onSectionChange: (section: HistoryDetailSection) => void;
  onClose: () => void;
  onRerun: () => void;
  onKill: () => void;
  onOpenPrompt: () => void;
  onOpenSchedule: () => void;
  getRunDisplayName: (run: AIRunnerRunDTO) => string;
  profileName: string;
  promptSourceName: string;
  scheduleName: string;
}) {
  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close run detail"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute inset-y-0 right-0 flex w-full justify-end">
        <div className="relative flex h-full w-full max-w-4xl flex-col border-l border-border/60 bg-card shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-border/60 px-6 py-5">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={getRunStatusVariant(run.status)}>{run.status}</Badge>
                <Badge variant="outline">{run.triggeredBy}</Badge>
                {run.jobStatus ? <Badge variant="outline">job {run.jobStatus}</Badge> : null}
              </div>
              <div>
                <h3 className="text-lg font-semibold">{getRunDisplayName(run)}</h3>
                <p className="text-sm text-muted-foreground">
                  {profileName} • {formatDateTime(run.startedAt)}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-6 py-3">
            {(
              [
                ['summary', 'Summary'],
                ['output', 'Output'],
                ['command', 'Command'],
                ['metadata', 'Metadata'],
                ['resources', 'Resources'],
              ] as Array<[HistoryDetailSection, string]>
            ).map(([section, label]) => (
              <Button
                key={section}
                variant={historyDetailSection === section ? 'default' : 'outline'}
                size="sm"
                onClick={() => onSectionChange(section)}
              >
                {label}
              </Button>
            ))}

            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={onRerun}>
                <Play className="w-4 h-4" />
                Rerun
              </Button>
              {(run.status === 'failed' || run.status === 'timeout') && (
                <Button variant="outline" size="sm" onClick={onRerun}>
                  <RefreshCcw className="w-4 h-4" />
                  Retry
                </Button>
              )}
              {run.status === 'running' && (
                <Button variant="destructive" size="sm" onClick={onKill}>
                  <Square className="w-4 h-4" />
                  Kill
                </Button>
              )}
              {run.promptId ? (
                <Button variant="outline" size="sm" onClick={onOpenPrompt}>
                  <ExternalLink className="w-4 h-4" />
                  Open Prompt
                </Button>
              ) : null}
              {run.scheduleId ? (
                <Button variant="outline" size="sm" onClick={onOpenSchedule}>
                  <PanelRightOpen className="w-4 h-4" />
                  Open Schedule
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {historyDetailSection === 'summary' && (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-border/60 bg-secondary/15 px-4 py-3">
                    <p className="text-xs text-muted-foreground">Started</p>
                    <p className="mt-1 font-medium">{formatDateTime(run.startedAt)}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-secondary/15 px-4 py-3">
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="mt-1 font-medium">{formatDuration(run.durationSeconds)}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-secondary/15 px-4 py-3">
                    <p className="text-xs text-muted-foreground">Exit code</p>
                    <p className="mt-1 font-medium">
                      {run.exitCode === undefined ? '—' : run.exitCode}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-secondary/15 px-4 py-3">
                    <p className="text-xs text-muted-foreground">Peak memory</p>
                    <p className="mt-1 font-medium">
                      {formatMemory(run.resourceUsage?.peakMemoryBytes)}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-xl border border-border/60 bg-background p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Prompt</p>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6">
                      {run.promptContent || 'No prompt content captured'}
                    </p>
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-xl border border-border/60 bg-background p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Profile
                      </p>
                      <p className="mt-2 font-medium">{profileName}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Prompt source
                      </p>
                      <p className="mt-2 font-medium">{promptSourceName}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Schedule
                      </p>
                      <p className="mt-2 font-medium">{scheduleName}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {historyDetailSection === 'output' && (
              <div className="space-y-4">
                <div className="overflow-hidden rounded-xl border border-border bg-background">
                  <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
                    Clean output
                  </div>
                  <pre className="max-h-[520px] overflow-auto px-4 py-4 text-xs leading-6 whitespace-pre-wrap font-mono">
                    {run.stdout || run.stderr || 'No output captured'}
                  </pre>
                </div>
                <div className="overflow-hidden rounded-xl border border-border bg-background">
                  <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
                    Raw output
                  </div>
                  <pre className="max-h-[280px] overflow-auto px-4 py-4 text-xs leading-6 whitespace-pre-wrap font-mono">
                    {run.rawOutput || 'No raw output captured'}
                  </pre>
                </div>
              </div>
            )}

            {historyDetailSection === 'command' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-border/60 bg-background p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Command</p>
                  <pre className="mt-3 whitespace-pre-wrap break-all text-xs leading-6 font-mono">
                    {run.command}
                  </pre>
                </div>
                <div className="rounded-xl border border-border/60 bg-background p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Working directory
                  </p>
                  <pre className="mt-3 whitespace-pre-wrap break-all text-xs leading-6 font-mono">
                    {run.workingDirectory}
                  </pre>
                </div>
              </div>
            )}

            {historyDetailSection === 'metadata' && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-border/60 bg-background p-4 text-sm">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Run metadata
                  </p>
                  <dl className="mt-3 space-y-3">
                    <div>
                      <dt className="text-xs text-muted-foreground">Run id</dt>
                      <dd className="break-all font-mono text-xs">{run._id}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Job id</dt>
                      <dd className="break-all font-mono text-xs">{run.jobId || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Prompt id</dt>
                      <dd className="break-all font-mono text-xs">{run.promptId || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Schedule id</dt>
                      <dd className="break-all font-mono text-xs">{run.scheduleId || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">PID</dt>
                      <dd>{run.pid ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Attempts</dt>
                      <dd>
                        {run.attemptCount ?? 0}
                        {run.maxAttempts ? ` / ${run.maxAttempts}` : ''}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="rounded-xl border border-border/60 bg-background p-4 text-sm">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Timing and state
                  </p>
                  <dl className="mt-3 space-y-3">
                    <div>
                      <dt className="text-xs text-muted-foreground">Started</dt>
                      <dd>{formatDateTime(run.startedAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Finished</dt>
                      <dd>{formatDateTime(run.finishedAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Heartbeat</dt>
                      <dd>{formatDateTime(run.heartbeatAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Last output</dt>
                      <dd>{formatDateTime(run.lastOutputAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Last error</dt>
                      <dd className="whitespace-pre-wrap break-words">{run.lastError || '—'}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            )}

            {historyDetailSection === 'resources' && (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-border/60 bg-background p-5">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Cpu className="w-4 h-4" />
                    <span className="text-xs uppercase tracking-wide">Peak CPU</span>
                  </div>
                  <p className="mt-4 text-2xl font-semibold">
                    {run.resourceUsage?.peakCpuPercent?.toFixed(1) ?? '—'}%
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background p-5">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <History className="w-4 h-4" />
                    <span className="text-xs uppercase tracking-wide">Peak memory</span>
                  </div>
                  <p className="mt-4 text-2xl font-semibold">
                    {formatMemory(run.resourceUsage?.peakMemoryBytes)}
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background p-5">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Zap className="w-4 h-4" />
                    <span className="text-xs uppercase tracking-wide">Peak memory %</span>
                  </div>
                  <p className="mt-4 text-2xl font-semibold">
                    {run.resourceUsage?.peakMemoryPercent?.toFixed(1) ?? '—'}%
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
