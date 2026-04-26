'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Cpu,
  ExternalLink,
  History,
  PanelRightOpen,
  Play,
  RefreshCcw,
  Square,
  X,
  Zap,
} from 'lucide-react';
import { AutoscrollButton } from '@/components/ui/AutoscrollButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AIRunnerRunDTO } from '../../types';
import type { HistoryDetailSection } from '../types';
import { formatDateTime, formatDuration, formatMemory, getRunStatusVariant } from '../utils';

function formatDetailedDateTime(iso?: string): string {
  return formatDateTime(iso, { includeSeconds: true });
}

function formatTimingDelay(from?: string, to?: string): string {
  if (!from || !to) return '—';
  const delaySeconds = Math.max(
    0,
    Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000)
  );
  return delaySeconds === 0 ? '0s' : formatDuration(delaySeconds);
}

function getDelaySeconds(from?: string, to?: string): number {
  if (!from || !to) return 0;
  return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000));
}

function getScheduleDelayInsight(run: AIRunnerRunDTO): { title: string; body: string } | null {
  if (run.triggeredBy !== 'schedule' || !run.scheduledFor || !run.dispatchedAt) {
    return null;
  }

  const dispatchDelaySeconds = getDelaySeconds(run.queuedAt, run.dispatchedAt);
  if (dispatchDelaySeconds < 5 * 60) {
    return null;
  }

  const queueDelaySeconds = getDelaySeconds(run.scheduledFor, run.queuedAt);

  if (queueDelaySeconds <= 30) {
    return {
      title: 'Late dispatch usually means ServerMon was unavailable',
      body: `This run hit the queue on time, then waited ${formatDuration(dispatchDelaySeconds)} before dispatch. That usually means ServerMon or the AI Runner supervisor was offline, restarting, or not running as a boot-time service during that window.`,
    };
  }

  return {
    title: 'Late queueing usually means the scheduler was offline',
    body: `This run was queued ${formatDuration(queueDelaySeconds)} after its ideal start time. That usually means the AI Runner scheduler was unavailable until ServerMon came back online.`,
  };
}

export function RunDetailDrawer({
  run,
  historyDetailSection,
  onSectionChange,
  onClose,
  onRerun,
  onKill,
  rerunPending = false,
  killPending = false,
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
  rerunPending?: boolean;
  killPending?: boolean;
  onOpenPrompt: () => void;
  onOpenSchedule: () => void;
  getRunDisplayName: (run: AIRunnerRunDTO) => string;
  profileName: string;
  promptSourceName: string;
  scheduleName: string;
}) {
  const [autoscrollEnabled, setAutoscrollEnabled] = useState(true);
  const scheduleDelayInsight = getScheduleDelayInsight(run);
  const primaryTimestamp = run.startedAt ?? run.queuedAt;
  const primaryTimestampLabel = run.startedAt ? 'Started' : 'Queued';
  const timingRows = [
    ...(run.scheduleId || run.scheduledFor
      ? [
          {
            label: 'Ideal start time',
            value: formatDetailedDateTime(run.scheduledFor),
          },
          {
            label: 'Queue delay',
            value: formatTimingDelay(run.scheduledFor, run.queuedAt),
          },
        ]
      : []),
    {
      label: 'Queued at',
      value: formatDetailedDateTime(run.queuedAt),
    },
    {
      label: 'Dispatched at',
      value: formatDetailedDateTime(run.dispatchedAt),
    },
    {
      label: 'Dispatch delay',
      value: formatTimingDelay(run.queuedAt, run.dispatchedAt),
    },
    {
      label: 'Started at',
      value: formatDetailedDateTime(run.startedAt),
    },
    {
      label: 'Start delay',
      value: formatTimingDelay(run.queuedAt, run.startedAt),
    },
    {
      label: 'Finished',
      value: formatDetailedDateTime(run.finishedAt),
    },
    {
      label: 'Heartbeat',
      value: formatDetailedDateTime(run.heartbeatAt),
    },
    {
      label: 'Last output',
      value: formatDetailedDateTime(run.lastOutputAt),
    },
    {
      label: 'Last error',
      value: run.lastError || '—',
      className: 'whitespace-pre-wrap break-words',
    },
  ];

  // Reset autoscroll when switching to output section or a new run
  const [lastStateKey, setLastStateKey] = useState(`${run._id}-${historyDetailSection}`);
  if (lastStateKey !== `${run._id}-${historyDetailSection}`) {
    setLastStateKey(`${run._id}-${historyDetailSection}`);
    if (historyDetailSection === 'output') {
      setAutoscrollEnabled(true);
    }
  }

  const outputRef = useRef<HTMLPreElement | null>(null);
  const outputText = run.rawOutput || run.stdout || run.stderr || 'No output captured';

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (historyDetailSection !== 'output') return;
    if (!autoscrollEnabled) return;
    const node = outputRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [autoscrollEnabled, historyDetailSection, outputText]);

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close run detail"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute inset-y-0 right-0 flex w-full justify-end overflow-hidden">
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
                  {profileName} • {formatDetailedDateTime(primaryTimestamp)}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-3 border-b border-border/60 px-6 py-3">
            <div aria-label="Run detail sections" className="flex flex-wrap items-center gap-2">
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
            </div>

            <div aria-label="Run detail actions" className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onRerun} loading={rerunPending}>
                <Play className="w-4 h-4" />
                Rerun
              </Button>
              {(run.status === 'failed' || run.status === 'timeout') && (
                <Button variant="outline" size="sm" onClick={onRerun} loading={rerunPending}>
                  <RefreshCcw className="w-4 h-4" />
                  Retry
                </Button>
              )}
              {run.status === 'running' && (
                <Button variant="destructive" size="sm" onClick={onKill} loading={killPending}>
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

          <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5">
            {historyDetailSection === 'summary' && (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-border/60 bg-secondary/15 px-4 py-3">
                    <p className="text-xs text-muted-foreground">{primaryTimestampLabel}</p>
                    <p className="mt-1 font-medium">{formatDetailedDateTime(primaryTimestamp)}</p>
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

                {scheduleDelayInsight ? (
                  <div className="rounded-xl border border-warning/30 bg-warning/10 p-4">
                    <div className="flex gap-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
                      <div>
                        <p className="text-sm font-medium">{scheduleDelayInsight.title}</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {scheduleDelayInsight.body}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {historyDetailSection === 'output' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-secondary/15 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Output</p>
                    <p className="text-xs text-muted-foreground">
                      Live execution output in one stream.
                    </p>
                  </div>
                  <AutoscrollButton enabled={autoscrollEnabled} onToggle={setAutoscrollEnabled} />
                </div>
                <div className="overflow-hidden rounded-xl border border-border bg-background">
                  <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
                    Captured output
                  </div>
                  <pre
                    ref={outputRef}
                    className="custom-scrollbar max-h-[520px] overflow-auto overscroll-contain px-4 py-4 text-xs leading-6 whitespace-pre-wrap font-mono"
                  >
                    {outputText}
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
                      <dt className="text-xs text-muted-foreground">Artifact directory</dt>
                      <dd className="break-all font-mono text-xs">{run.artifactDir || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Recovery state</dt>
                      <dd>{run.recoveryState || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Recovery error</dt>
                      <dd className="break-words">{run.lastRecoveryError || '—'}</dd>
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
                    {timingRows.map((row) => (
                      <div key={row.label}>
                        <dt className="text-xs text-muted-foreground">{row.label}</dt>
                        <dd className={row.className}>{row.value}</dd>
                      </div>
                    ))}
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
