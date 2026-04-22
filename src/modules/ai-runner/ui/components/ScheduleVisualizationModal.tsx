'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bot, LayoutGrid, Rows3, Search, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { AIRunnerProfileDTO, AIRunnerPromptDTO, AIRunnerScheduleDTO } from '../../types';
import type {
  ProfileVisualization,
  ScheduleConflictWindow,
  ScheduleVisualizationModel,
  ScheduleVisualizationRisk,
  VisualizedSchedule,
  WorkspaceVisualization,
} from '../scheduleVisualization';
import { buildScheduleVisualizationModel } from '../scheduleVisualization';
import { formatCountdown, formatScheduleDate, humanizeCron } from '../utils';

interface ScheduleVisualizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedules: AIRunnerScheduleDTO[];
  promptMap: Record<string, AIRunnerPromptDTO>;
  profileMap: Record<string, AIRunnerProfileDTO>;
  scopeLabel?: string;
}

type VisualizationMode = 'workspace' | 'profile' | 'board';

export function ScheduleVisualizationModal({
  isOpen,
  onClose,
  schedules,
  promptMap,
  profileMap,
  scopeLabel,
}: ScheduleVisualizationModalProps) {
  const [mode, setMode] = useState<VisualizationMode>('workspace');
  const [query, setQuery] = useState('');
  const [showPaused, setShowPaused] = useState(true);

  const filteredSchedules = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return schedules.filter((schedule) => {
      if (!showPaused && !schedule.enabled) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const promptName = promptMap[schedule.promptId]?.name ?? '';
      const profileName = profileMap[schedule.agentProfileId]?.name ?? '';
      const searchText = [
        schedule.name,
        schedule.workingDirectory,
        schedule.cronExpression,
        promptName,
        profileName,
      ]
        .join(' ')
        .toLowerCase();

      return searchText.includes(normalizedQuery);
    });
  }, [profileMap, promptMap, query, schedules, showPaused]);

  const visualization = useMemo(
    () =>
      buildScheduleVisualizationModel(filteredSchedules, {
        profileMap,
      }),
    [filteredSchedules, profileMap]
  );

  const activeGroups =
    mode === 'workspace'
      ? visualization.workspaces
      : mode === 'profile'
        ? visualization.profiles
        : [];

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

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-6">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-visualization-title"
        className="relative flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-border/60 bg-card shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-5 md:px-6">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Schedule Visualization</Badge>
              <Badge variant="outline">Next 24 hours</Badge>
              {scopeLabel ? <Badge variant="outline">Profile scope: {scopeLabel}</Badge> : null}
            </div>
            <h3
              id="schedule-visualization-title"
              className="mt-3 text-2xl font-semibold tracking-tight"
            >
              {scopeLabel
                ? `Visualize ${scopeLabel} schedule pressure before runs step on each other`
                : 'Visualize schedule pressure and overall split before agents step on each other'}
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Keep this simple: switch between workspace view, agent profile view, and an all
              schedules board to spot overlaps quickly.
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

        <div className="overflow-y-auto px-5 py-5 md:px-6">
          <div className="space-y-5">
            <div className="rounded-[24px] border border-border/60 bg-background/60 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  <ModeButton
                    active={mode === 'workspace'}
                    icon={<LayoutGrid className="h-4 w-4" />}
                    label="By Workspace"
                    onClick={() => setMode('workspace')}
                  />
                  <ModeButton
                    active={mode === 'profile'}
                    icon={<Bot className="h-4 w-4" />}
                    label="By Agent Profile"
                    onClick={() => setMode('profile')}
                  />
                  <ModeButton
                    active={mode === 'board'}
                    icon={<Rows3 className="h-4 w-4" />}
                    label="All Schedules"
                    onClick={() => setMode('board')}
                  />
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search schedule, profile, prompt, or workspace"
                    icon={<Search className="h-4 w-4" />}
                    className="h-10 min-w-[260px] rounded-xl"
                    aria-label="Search schedules"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-xl"
                    onClick={() => setShowPaused((current) => !current)}
                  >
                    {showPaused ? 'Hide paused' : 'Show paused'}
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                label="Schedules"
                value={visualization.visualizedSchedules.length}
                detail={`${visualization.enabledScheduleCount} enabled`}
              />
              <SummaryCard
                label={mode === 'profile' ? 'Profiles' : 'Workspaces'}
                value={
                  mode === 'profile' ? visualization.profileCount : visualization.workspaceCount
                }
                detail={
                  mode === 'profile' ? 'Grouped by agent profile.' : 'Grouped by working directory.'
                }
              />
              <SummaryCard
                label="Overlap windows"
                value={
                  mode === 'profile'
                    ? visualization.profileConflictCount
                    : visualization.totalConflictCount
                }
                detail="Predicted within timeout windows."
                tone={
                  (mode === 'profile'
                    ? visualization.profileConflictCount
                    : visualization.totalConflictCount) > 0
                    ? 'warning'
                    : 'default'
                }
              />
              <SummaryCard
                label="Next launch"
                value={
                  visualization.nextRunTime
                    ? formatScheduleDate(visualization.nextRunTime)
                    : 'No launch'
                }
                detail={
                  visualization.nextRunTime
                    ? formatCountdown(visualization.nextRunTime)
                    : 'Nothing enabled right now.'
                }
              />
            </div>

            {visualization.visualizedSchedules.length === 0 ? (
              <EmptyState
                title={
                  schedules.length === 0
                    ? 'No schedules to visualize'
                    : 'No schedules match the current filter'
                }
                description={
                  schedules.length === 0
                    ? 'Create a schedule first, then come back here to review overlap and launch timing.'
                    : 'Try a broader search or show paused schedules again.'
                }
              />
            ) : mode === 'board' ? (
              <BoardPanel
                visualization={visualization}
                promptMap={promptMap}
                profileMap={profileMap}
              />
            ) : activeGroups.length === 0 ? (
              <EmptyState
                title={`No ${mode === 'workspace' ? 'workspaces' : 'profiles'} match`}
                description="The current filter removed every group."
              />
            ) : (
              <div className="space-y-4">
                {mode === 'workspace'
                  ? visualization.workspaces.map((workspace) => (
                      <GroupPanel
                        key={workspace.workspaceKey}
                        group={workspace}
                        grouping="workspace"
                        visualization={visualization}
                        promptMap={promptMap}
                        profileMap={profileMap}
                      />
                    ))
                  : visualization.profiles.map((profile) => (
                      <GroupPanel
                        key={profile.profileKey}
                        group={profile}
                        grouping="profile"
                        visualization={visualization}
                        promptMap={promptMap}
                        profileMap={profileMap}
                      />
                    ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-border/60 bg-background/85 px-5 py-4 md:px-6">
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
  value: number | string;
  detail: string;
  tone?: 'default' | 'warning';
}) {
  return (
    <div
      className={cn(
        'rounded-[20px] border px-4 py-4',
        tone === 'warning' ? 'border-warning/25 bg-warning/5' : 'border-border/60 bg-background/70'
      )}
    >
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function ModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button type="button" size="sm" variant={active ? 'default' : 'outline'} onClick={onClick}>
      {icon}
      {label}
    </Button>
  );
}

function GroupPanel({
  group,
  grouping,
  visualization,
  promptMap,
  profileMap,
}: {
  group: WorkspaceVisualization | ProfileVisualization;
  grouping: 'workspace' | 'profile';
  visualization: ScheduleVisualizationModel;
  promptMap: Record<string, AIRunnerPromptDTO>;
  profileMap: Record<string, AIRunnerProfileDTO>;
}) {
  return (
    <div className="rounded-[24px] border border-border/60 bg-background/70 p-5">
      <div className="flex flex-col gap-4 border-b border-border/60 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <RiskBadge risk={group.risk} />
            <Badge variant="outline">{group.enabledCount} enabled</Badge>
            {group.pausedCount > 0 ? (
              <Badge variant="warning">{group.pausedCount} paused</Badge>
            ) : null}
            {group.conflictCount > 0 ? (
              <Badge variant="destructive">
                {group.conflictCount} overlap window{group.conflictCount === 1 ? '' : 's'}
              </Badge>
            ) : null}
          </div>
          <h4 className="mt-3 text-lg font-semibold tracking-tight break-all">
            {getGroupLabel(group)}
          </h4>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{group.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="outline">
            {grouping === 'workspace'
              ? `${group.uniqueProfileCount} profile${group.uniqueProfileCount === 1 ? '' : 's'}`
              : `${group.uniqueWorkspaceCount} workspace${group.uniqueWorkspaceCount === 1 ? '' : 's'}`}
          </Badge>
          <Badge variant="outline">
            {group.schedules.length} schedule{group.schedules.length === 1 ? '' : 's'}
          </Badge>
          <Badge variant="outline">{group.projectedRuntimeMinutes} runtime min</Badge>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {group.schedules.map((entry) => (
          <ScheduleTimelineRow
            key={entry.schedule._id}
            entry={entry}
            promptMap={promptMap}
            profileMap={profileMap}
            visualization={visualization}
            grouping={grouping}
            groupRisk={group.risk}
          />
        ))}
      </div>

      <div className="mt-4">
        {group.conflicts.length > 0 ? (
          <ConflictPanel conflicts={group.conflicts} />
        ) : (
          <div className="rounded-[20px] border border-success/20 bg-success/5 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-success" />
              <div>
                <p className="text-sm font-semibold">No overlap predicted</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Timeout windows do not collide in this{' '}
                  {grouping === 'workspace' ? 'workspace' : 'profile'}.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BoardPanel({
  visualization,
  promptMap,
  profileMap,
}: {
  visualization: ScheduleVisualizationModel;
  promptMap: Record<string, AIRunnerPromptDTO>;
  profileMap: Record<string, AIRunnerProfileDTO>;
}) {
  return (
    <div className="rounded-[24px] border border-border/60 bg-background/70 p-5">
      <div className="flex flex-col gap-3 border-b border-border/60 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h4 className="text-lg font-semibold tracking-tight">All schedules</h4>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            A flat list when you want to scan everything at once.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{visualization.workspaceCount} workspaces</Badge>
          <Badge variant="outline">{visualization.profileCount} profiles</Badge>
          <Badge variant="outline">{visualization.enabledScheduleCount} enabled</Badge>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {visualization.visualizedSchedules.map((entry) => (
          <div
            key={entry.schedule._id}
            className={cn(
              'grid gap-4 rounded-[20px] border border-border/60 px-4 py-4 xl:grid-cols-[minmax(0,240px)_minmax(0,140px)_minmax(0,180px)_minmax(0,1fr)_160px]',
              entry.schedule.enabled ? 'bg-card/50' : 'bg-muted/15'
            )}
          >
            <ScheduleMeta entry={entry} promptMap={promptMap} profileMap={profileMap} />
            <BoardLabel value={entry.profileLabel} />
            <BoardLabel value={entry.workspaceLabel} />
            <TimelineTrack
              entry={entry}
              horizonStartMs={visualization.horizonStartMs}
              horizonEndMs={visualization.horizonEndMs}
              tone={
                getScheduleWorkspaceRisk(entry, visualization) === 'high' ? 'warning' : 'primary'
              }
            />
            <ScheduleRunSummary entry={entry} />
          </div>
        ))}
      </div>
    </div>
  );
}

function BoardLabel({ value }: { value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/60 bg-background/70 px-3 py-3">
      <p className="break-all text-xs leading-5 text-muted-foreground">{value}</p>
    </div>
  );
}

function ScheduleTimelineRow({
  entry,
  promptMap,
  profileMap,
  visualization,
  grouping,
  groupRisk,
}: {
  entry: VisualizedSchedule;
  promptMap: Record<string, AIRunnerPromptDTO>;
  profileMap: Record<string, AIRunnerProfileDTO>;
  visualization: ScheduleVisualizationModel;
  grouping: 'workspace' | 'profile';
  groupRisk: ScheduleVisualizationRisk;
}) {
  return (
    <div
      className={cn(
        'grid gap-4 rounded-[20px] border border-border/60 px-4 py-4 xl:grid-cols-[minmax(0,240px)_minmax(0,1fr)_160px]',
        entry.schedule.enabled ? 'bg-card/50' : 'bg-muted/15'
      )}
    >
      <div className="min-w-0">
        <ScheduleMeta entry={entry} promptMap={promptMap} profileMap={profileMap} />
        <div className="mt-3 flex flex-wrap gap-2">
          {grouping === 'workspace' ? (
            <Badge variant="outline">{entry.profileLabel}</Badge>
          ) : (
            <Badge variant="outline" className="max-w-full">
              <span className="truncate">{entry.workspaceLabel}</span>
            </Badge>
          )}
          {entry.previewLimited ? <Badge variant="outline">Limited forecast</Badge> : null}
        </div>
      </div>

      <TimelineTrack
        entry={entry}
        horizonStartMs={visualization.horizonStartMs}
        horizonEndMs={visualization.horizonEndMs}
        tone={groupRisk === 'high' ? 'warning' : 'primary'}
      />

      <ScheduleRunSummary entry={entry} />
    </div>
  );
}

function ScheduleMeta({
  entry,
  promptMap,
  profileMap,
}: {
  entry: VisualizedSchedule;
  promptMap: Record<string, AIRunnerPromptDTO>;
  profileMap: Record<string, AIRunnerProfileDTO>;
}) {
  const prompt = promptMap[entry.schedule.promptId];
  const profile = profileMap[entry.schedule.agentProfileId];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">{entry.schedule.name}</p>
        <Badge variant={entry.schedule.enabled ? 'success' : 'warning'}>
          {entry.schedule.enabled ? 'Enabled' : 'Paused'}
        </Badge>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {humanizeCron(entry.schedule.cronExpression)}
      </p>
      <div className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
        <p>Prompt: {prompt?.name ?? 'Unknown prompt'}</p>
        <p>Profile: {profile?.name ?? entry.profileLabel}</p>
      </div>
    </>
  );
}

function TimelineTrack({
  entry,
  horizonStartMs,
  horizonEndMs,
  tone,
}: {
  entry: VisualizedSchedule;
  horizonStartMs: number;
  horizonEndMs: number;
  tone: 'primary' | 'warning';
}) {
  const horizonMs = Math.max(horizonEndMs - horizonStartMs, 1);

  return (
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
                  tone === 'warning'
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
            key={`${entry.schedule._id}-${index}`}
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
  );
}

function ScheduleRunSummary({ entry }: { entry: VisualizedSchedule }) {
  return (
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
      <p className="mt-3 text-xs text-muted-foreground">Timeout</p>
      <p className="mt-1 font-medium">{entry.schedule.timeout} min</p>
    </div>
  );
}

function ConflictPanel({ conflicts }: { conflicts: ScheduleConflictWindow[] }) {
  return (
    <div className="rounded-[20px] border border-destructive/20 bg-destructive/5 p-4">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Predicted overlap windows</p>
          <div className="mt-3 space-y-2">
            {conflicts.slice(0, 4).map((conflict, index) => (
              <div
                key={`${conflict.startMs}-${conflict.endMs}-${index}`}
                className="rounded-xl border border-border/60 bg-background/80 px-3 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={conflict.severity === 'high' ? 'destructive' : 'warning'}>
                    {conflict.kind === 'self-overlap' ? 'Self overlap' : 'Shared overlap'}
                  </Badge>
                  <span className="text-sm font-medium">
                    {formatScheduleDate(new Date(conflict.startMs).toISOString())} to{' '}
                    {formatScheduleDate(new Date(conflict.endMs).toISOString())}
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
  );
}

function RiskBadge({ risk }: { risk: ScheduleVisualizationRisk }) {
  if (risk === 'high') {
    return <Badge variant="destructive">High collision risk</Badge>;
  }
  if (risk === 'medium') {
    return <Badge variant="warning">Shared surface</Badge>;
  }
  return <Badge variant="success">Low collision risk</Badge>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-border/60 bg-background/60 px-6 py-16 text-center">
      <h4 className="text-xl font-semibold tracking-tight">{title}</h4>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function getScheduleWorkspaceRisk(
  entry: VisualizedSchedule,
  visualization: ScheduleVisualizationModel
): ScheduleVisualizationRisk {
  return (
    visualization.workspaces.find((workspace) => workspace.workspaceKey === entry.workspaceKey)
      ?.risk ?? 'low'
  );
}

function getGroupLabel(group: WorkspaceVisualization | ProfileVisualization): string {
  return 'workspaceLabel' in group ? group.workspaceLabel : group.profileLabel;
}
