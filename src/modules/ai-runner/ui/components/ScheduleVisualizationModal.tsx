'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Eye, LayoutGrid, Rows3, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AIRunnerProfileDTO, AIRunnerPromptDTO, AIRunnerScheduleDTO } from '../../types';
import { buildScheduleVisualizationModel } from '../scheduleVisualization';
import { formatCountdown, formatScheduleDate, humanizeCron } from '../utils';

interface ScheduleVisualizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedules: AIRunnerScheduleDTO[];
  promptMap: Record<string, AIRunnerPromptDTO>;
  profileMap: Record<string, AIRunnerProfileDTO>;
}

type VisualizationMode = 'workspace' | 'all';

export function ScheduleVisualizationModal({
  isOpen,
  onClose,
  schedules,
  promptMap,
  profileMap,
}: ScheduleVisualizationModalProps) {
  const [mode, setMode] = useState<VisualizationMode>('workspace');
  const visualization = useMemo(() => buildScheduleVisualizationModel(schedules), [schedules]);
  const allScheduleEntries = useMemo(
    () =>
      visualization.workspaces
        .flatMap((workspace) =>
          workspace.schedules.map((entry) => ({
            ...entry,
            workspaceLabel: workspace.workspaceLabel,
            workspaceRisk: workspace.risk,
            workspaceConflictCount: workspace.conflictCount,
          }))
        )
        .sort((left, right) => {
          if (left.schedule.enabled !== right.schedule.enabled) {
            return left.schedule.enabled ? -1 : 1;
          }
          if (left.schedule.nextRunTime && right.schedule.nextRunTime) {
            return (
              new Date(left.schedule.nextRunTime).getTime() -
              new Date(right.schedule.nextRunTime).getTime()
            );
          }
          if (left.schedule.nextRunTime) return -1;
          if (right.schedule.nextRunTime) return 1;
          return left.schedule.name.localeCompare(right.schedule.name);
        }),
    [visualization.workspaces]
  );

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setMode('workspace');
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const horizonMs = visualization.horizonEndMs - visualization.horizonStartMs || 1;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-6">
      <div
        className="absolute inset-0 bg-background/85 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-visualization-title"
        className="relative flex max-h-[92dvh] w-full max-w-7xl flex-col overflow-hidden rounded-[32px] border border-primary/20 bg-card/95 shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border/60 bg-background/85 px-6 py-5 backdrop-blur">
          <div className="max-w-3xl">
            <p className="text-[11px] uppercase tracking-[0.26em] text-primary/80">
              Schedule Visualization
            </p>
            <h3
              id="schedule-visualization-title"
              className="mt-2 text-2xl font-semibold tracking-tight"
            >
              Visualize schedule pressure and overall split before agents step on each other
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Switch between workspace collision planning and a full schedule board. Both views
              project the next 24 hours so you can understand overlap windows, runtime pressure, and
              how the schedule load is distributed overall.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            aria-label="Close schedule visualization"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-6">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-border/60 bg-background/70 px-5 py-4">
              <div>
                <p className="text-sm font-semibold">View mode</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Use workspace mode for collision planning, or all schedules mode to review the
                  full split across the system.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === 'workspace' ? 'default' : 'outline'}
                  onClick={() => setMode('workspace')}
                >
                  <LayoutGrid className="h-4 w-4" />
                  By Workspace
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === 'all' ? 'default' : 'outline'}
                  onClick={() => setMode('all')}
                >
                  <Rows3 className="h-4 w-4" />
                  All Schedules
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {mode === 'workspace' ? (
                <>
                  <SummaryCard
                    label="Workspaces"
                    value={visualization.workspaceCount}
                    detail="Grouped by working directory."
                  />
                  <SummaryCard
                    label="High Risk"
                    value={visualization.highRiskWorkspaceCount}
                    detail="Shared workspaces with predicted overlap."
                    tone="destructive"
                  />
                  <SummaryCard
                    label="Conflict Windows"
                    value={visualization.totalConflictCount}
                    detail="Projected across the next 24 hours."
                    tone="warning"
                  />
                  <SummaryCard
                    label="Limited Forecasts"
                    value={visualization.limitedPreviewCount}
                    detail="Advanced cron or missing next-run data."
                  />
                </>
              ) : (
                <>
                  <SummaryCard
                    label="Schedules"
                    value={allScheduleEntries.length}
                    detail="Every scheduled automation in one board."
                  />
                  <SummaryCard
                    label="Enabled"
                    value={visualization.enabledScheduleCount}
                    detail="Currently participating in the forecast."
                  />
                  <SummaryCard
                    label="Workspace Split"
                    value={visualization.workspaceCount}
                    detail="How many working directories the load is spread across."
                  />
                  <SummaryCard
                    label="Limited Forecasts"
                    value={visualization.limitedPreviewCount}
                    detail="Advanced cron or missing next-run data."
                  />
                </>
              )}
            </div>

            <div className="rounded-[24px] border border-warning/25 bg-warning/5 px-5 py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold">
                    {mode === 'workspace'
                      ? 'Why workspace mode matters'
                      : 'Why full schedule mode matters'}
                  </p>
                  {mode === 'workspace' ? (
                    <p className="text-sm leading-6 text-muted-foreground">
                      When multiple enabled schedules target the same workspace, one run can still
                      be writing files, changing branches, or touching caches when the next one
                      starts. This doesn&apos;t block anything automatically, but it gives operators
                      a clear pre-flight view before they decide how much concurrency is acceptable.
                    </p>
                  ) : (
                    <p className="text-sm leading-6 text-muted-foreground">
                      Sometimes the question is broader than conflict detection: you may want to see
                      how all schedules are distributed, which workspaces are crowded, and whether
                      the day is front-loaded or evenly split before you fine-tune individual
                      schedules.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {allScheduleEntries.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-primary/25 bg-gradient-to-br from-primary/5 via-background to-warning/5 px-6 py-16 text-center">
                <Eye className="mx-auto h-10 w-10 text-primary/70" />
                <h3 className="mt-4 text-xl font-semibold tracking-tight">
                  No schedules to visualize
                </h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Create a schedule first, then come back here to compare workspace pressure and
                  launch timing.
                </p>
              </div>
            ) : mode === 'workspace' ? (
              visualization.workspaces.map((workspace) => (
                <div
                  key={workspace.workspaceKey}
                  className="rounded-[28px] border border-border/60 bg-background/70 p-5"
                >
                  <div className="flex flex-col gap-4 border-b border-border/60 pb-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <RiskBadge risk={workspace.risk} />
                        <Badge variant="outline">{workspace.enabledCount} enabled</Badge>
                        {workspace.pausedCount > 0 ? (
                          <Badge variant="warning">{workspace.pausedCount} paused</Badge>
                        ) : null}
                        {workspace.conflictCount > 0 ? (
                          <Badge variant="destructive">
                            {workspace.conflictCount} conflict window
                            {workspace.conflictCount === 1 ? '' : 's'}
                          </Badge>
                        ) : null}
                      </div>
                      <h4 className="mt-3 text-lg font-semibold tracking-tight break-all">
                        {workspace.workspaceLabel}
                      </h4>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {workspace.summary}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-card/70 px-4 py-3 text-sm">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                        Horizon
                      </p>
                      <p className="mt-1 font-semibold">Next 24 hours</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Bars reflect scheduled start time plus timeout window.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-4">
                    <div className="grid grid-cols-[minmax(0,240px)_minmax(0,1fr)_160px] gap-4 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      <div>Schedule</div>
                      <div className="grid grid-cols-5 gap-2">
                        {['Now', '+6h', '+12h', '+18h', '+24h'].map((label) => (
                          <span key={label}>{label}</span>
                        ))}
                      </div>
                      <div>Next / Timeout</div>
                    </div>

                    {workspace.schedules.map((entry) => (
                      <ScheduleTimelineRow
                        key={entry.schedule._id}
                        entry={entry}
                        promptMap={promptMap}
                        profileMap={profileMap}
                        horizonStartMs={visualization.horizonStartMs}
                        horizonMs={horizonMs}
                        barTone={workspace.risk === 'high' ? 'warning' : 'primary'}
                      />
                    ))}
                  </div>

                  {workspace.conflicts.length > 0 ? (
                    <div className="mt-5 rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
                      <div className="flex items-start gap-3">
                        <ShieldAlert className="mt-0.5 h-5 w-5 text-destructive" />
                        <div className="min-w-0 flex-1 space-y-3">
                          <div>
                            <p className="text-sm font-semibold">Predicted overlap windows</p>
                            <p className="mt-1 text-sm leading-6 text-muted-foreground">
                              These are the periods where one or more schedules may still be active
                              in this workspace at the same time.
                            </p>
                          </div>
                          <div className="space-y-2">
                            {workspace.conflicts.slice(0, 4).map((conflict, index) => (
                              <div
                                key={`${workspace.workspaceKey}-conflict-${index}`}
                                className="rounded-xl border border-border/60 bg-background/75 px-3 py-3"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge
                                    variant={
                                      conflict.severity === 'high' ? 'destructive' : 'warning'
                                    }
                                  >
                                    {conflict.kind === 'self-overlap'
                                      ? 'Self overlap'
                                      : 'Shared overlap'}
                                  </Badge>
                                  <span className="text-sm font-medium">
                                    {formatScheduleDate(new Date(conflict.startMs).toISOString())}{' '}
                                    to {formatScheduleDate(new Date(conflict.endMs).toISOString())}
                                  </span>
                                </div>
                                <p className="mt-2 text-sm text-muted-foreground">
                                  {conflict.scheduleNames.join(' + ')}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : workspace.enabledCount > 0 ? (
                    <div className="mt-5 rounded-2xl border border-success/20 bg-success/5 p-4">
                      <div className="flex items-start gap-3">
                        <ShieldCheck className="mt-0.5 h-5 w-5 text-success" />
                        <div>
                          <p className="text-sm font-semibold">
                            No overlap predicted in the next 24 hours
                          </p>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">
                            This workspace still deserves operator judgment, but the current
                            forecast doesn&apos;t show schedules colliding inside their timeout
                            windows.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="rounded-[28px] border border-border/60 bg-background/70 p-5">
                <div className="flex flex-col gap-4 border-b border-border/60 pb-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{visualization.enabledScheduleCount} enabled</Badge>
                      {visualization.pausedScheduleCount > 0 ? (
                        <Badge variant="warning">{visualization.pausedScheduleCount} paused</Badge>
                      ) : null}
                      <Badge variant="outline">{visualization.workspaceCount} workspaces</Badge>
                    </div>
                    <h4 className="mt-3 text-lg font-semibold tracking-tight">
                      Full Schedule View
                    </h4>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Every schedule in one timeline board so you can understand the total split
                      before drilling into workspace-specific overlap.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-card/70 px-4 py-3 text-sm">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      Horizon
                    </p>
                    <p className="mt-1 font-semibold">Next 24 hours</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Compare all schedules regardless of workspace.
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {visualization.workspaces.map((workspace) => (
                      <span
                        key={workspace.workspaceKey}
                        className="rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-xs text-muted-foreground"
                      >
                        {workspace.workspaceLabel}: {workspace.schedules.length}
                      </span>
                    ))}
                  </div>

                  <div className="grid grid-cols-[minmax(0,240px)_minmax(0,140px)_minmax(0,1fr)_160px] gap-4 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    <div>Schedule</div>
                    <div>Workspace</div>
                    <div className="grid grid-cols-5 gap-2">
                      {['Now', '+6h', '+12h', '+18h', '+24h'].map((label) => (
                        <span key={label}>{label}</span>
                      ))}
                    </div>
                    <div>Next / Timeout</div>
                  </div>

                  {allScheduleEntries.map((entry) => (
                    <ScheduleTimelineRow
                      key={entry.schedule._id}
                      entry={entry}
                      promptMap={promptMap}
                      profileMap={profileMap}
                      horizonStartMs={visualization.horizonStartMs}
                      horizonMs={horizonMs}
                      workspaceLabel={entry.workspaceLabel}
                      workspaceRisk={entry.workspaceRisk}
                      barTone={entry.workspaceConflictCount > 0 ? 'warning' : 'primary'}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-border/60 bg-background/85 px-6 py-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string;
  value: number;
  detail: string;
  tone?: 'default' | 'warning' | 'destructive';
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border px-4 py-4',
        tone === 'destructive'
          ? 'border-destructive/25 bg-destructive/5'
          : tone === 'warning'
            ? 'border-warning/25 bg-warning/5'
            : 'border-border/60 bg-background/75'
      )}
    >
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function RiskBadge({ risk }: { risk: 'low' | 'medium' | 'high' }) {
  if (risk === 'high') {
    return <Badge variant="destructive">High collision risk</Badge>;
  }
  if (risk === 'medium') {
    return <Badge variant="warning">Shared workspace</Badge>;
  }
  return <Badge variant="success">Low collision risk</Badge>;
}

function ScheduleTimelineRow({
  entry,
  promptMap,
  profileMap,
  horizonStartMs,
  horizonMs,
  barTone,
  workspaceLabel,
  workspaceRisk,
}: {
  entry: {
    schedule: AIRunnerScheduleDTO;
    timelineWindows: Array<{ startMs: number; endMs: number; occurrenceCount: number }>;
    occurrences: Array<{ startMs: number; endMs: number }>;
    previewLimited: boolean;
  };
  promptMap: Record<string, AIRunnerPromptDTO>;
  profileMap: Record<string, AIRunnerProfileDTO>;
  horizonStartMs: number;
  horizonMs: number;
  barTone: 'primary' | 'warning';
  workspaceLabel?: string;
  workspaceRisk?: 'low' | 'medium' | 'high';
}) {
  const prompt = promptMap[entry.schedule.promptId];
  const profile = profileMap[entry.schedule.agentProfileId];
  const gridClass = workspaceLabel
    ? 'grid gap-4 rounded-2xl border border-border/60 px-4 py-4 lg:grid-cols-[minmax(0,240px)_minmax(0,140px)_minmax(0,1fr)_160px]'
    : 'grid gap-4 rounded-2xl border border-border/60 px-4 py-4 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)_160px]';

  return (
    <div className={cn(gridClass, entry.schedule.enabled ? 'bg-card/50' : 'bg-muted/15')}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">{entry.schedule.name}</p>
          <Badge variant={entry.schedule.enabled ? 'success' : 'warning'}>
            {entry.schedule.enabled ? 'Enabled' : 'Paused'}
          </Badge>
          {entry.previewLimited ? <Badge variant="outline">Limited forecast</Badge> : null}
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {humanizeCron(entry.schedule.cronExpression)}
        </p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Prompt: {prompt?.name ?? 'Unknown prompt'}
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          Profile: {profile?.name ?? 'Unknown profile'}
        </p>
      </div>

      {workspaceLabel ? (
        <div className="min-w-0">
          <p className="font-mono text-xs leading-5 break-all">{workspaceLabel}</p>
          {workspaceRisk ? (
            <div className="mt-2">
              <RiskBadge risk={workspaceRisk} />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="relative h-12 overflow-hidden rounded-xl border border-border/60 bg-muted/20">
          <div className="absolute inset-y-0 left-0 border-l border-primary/50" />
          {[20, 40, 60, 80].map((offset) => (
            <div
              key={offset}
              className="absolute inset-y-0 border-l border-border/50"
              style={{ left: `${offset}%` }}
            />
          ))}

          {entry.timelineWindows.length > 0 ? (
            entry.timelineWindows.map((window, index) => {
              const left = ((window.startMs - horizonStartMs) / horizonMs) * 100;
              const width = Math.max(((window.endMs - window.startMs) / horizonMs) * 100, 1.25);

              return (
                <div
                  key={`${entry.schedule._id}-${index}`}
                  className={cn(
                    'absolute top-1/2 h-5 -translate-y-1/2 rounded-full border',
                    barTone === 'warning'
                      ? 'border-warning/40 bg-warning/25'
                      : 'border-primary/35 bg-primary/20'
                  )}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${entry.schedule.name}: ${formatScheduleDate(new Date(window.startMs).toISOString())} to ${formatScheduleDate(new Date(window.endMs).toISOString())}`}
                />
              );
            })
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              {entry.schedule.enabled ? 'No forecast available' : 'Paused'}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {entry.occurrences.slice(0, 3).map((occurrence, index) => (
            <span
              key={`${entry.schedule._id}-launch-${index}`}
              className="rounded-full border border-border/60 bg-background/80 px-2.5 py-1"
            >
              {formatScheduleDate(new Date(occurrence.startMs).toISOString())}
            </span>
          ))}
          {entry.occurrences.length > 3 ? (
            <span className="rounded-full border border-border/60 bg-background/80 px-2.5 py-1">
              +{entry.occurrences.length - 3} more launches
            </span>
          ) : null}
        </div>
      </div>

      <div className="text-sm">
        <p className="font-semibold">
          {entry.schedule.nextRunTime
            ? formatScheduleDate(entry.schedule.nextRunTime)
            : 'No next run'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {entry.schedule.nextRunTime
            ? formatCountdown(entry.schedule.nextRunTime)
            : 'Waiting for schedule data'}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">Timeout window</p>
        <p className="mt-1 font-medium">{entry.schedule.timeout} min</p>
      </div>
    </div>
  );
}
