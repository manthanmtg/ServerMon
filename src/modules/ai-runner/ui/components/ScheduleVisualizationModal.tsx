'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Clock3,
  Eye,
  Folder,
  LayoutGrid,
  Rows3,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { AIRunnerProfileDTO, AIRunnerPromptDTO, AIRunnerScheduleDTO } from '../../types';
import type {
  ProfileVisualization,
  ScheduleConflictWindow,
  ScheduleLoadBucket,
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
  const [mode, setMode] = useState<VisualizationMode>(() => (scopeLabel ? 'workspace' : 'profile'));
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

  const activeGroups = mode === 'workspace' ? visualization.workspaces : visualization.profiles;
  const rankedGroups = useMemo(
    () =>
      [...activeGroups]
        .sort((left, right) => {
          if (right.conflictCount !== left.conflictCount) {
            return right.conflictCount - left.conflictCount;
          }
          if (right.enabledCount !== left.enabledCount) {
            return right.enabledCount - left.enabledCount;
          }

          const leftLabel = getGroupLabel(left);
          const rightLabel = getGroupLabel(right);
          return leftLabel.localeCompare(rightLabel);
        })
        .slice(0, 4),
    [activeGroups]
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

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 md:p-6">
      <div
        className="absolute inset-0 bg-background/90 backdrop-blur-md animate-in fade-in duration-300"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-visualization-title"
        className="relative flex max-h-[94dvh] w-full max-w-[1560px] flex-col overflow-hidden rounded-[34px] border border-primary/20 bg-card/95 shadow-[0_30px_120px_rgba(2,6,23,0.78)] animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300"
      >
        <div className="relative overflow-hidden border-b border-border/60">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.28),transparent_34%),radial-gradient(circle_at_top_right,rgba(34,197,94,0.12),transparent_24%),linear-gradient(135deg,rgba(15,23,42,0.95),rgba(2,6,23,0.98))]" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

          <div className="relative px-5 py-5 md:px-7 md:py-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-4xl">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                    Schedule Visualization
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-border/70 bg-background/30 text-foreground"
                  >
                    24 hour forecast
                  </Badge>
                  {scopeLabel ? (
                    <Badge
                      variant="outline"
                      className="border-warning/30 bg-warning/10 text-warning"
                    >
                      Profile scope: {scopeLabel}
                    </Badge>
                  ) : null}
                </div>
                <h3
                  id="schedule-visualization-title"
                  className="mt-4 max-w-4xl text-2xl font-semibold tracking-tight text-white md:text-4xl"
                >
                  {scopeLabel
                    ? `Visualize ${scopeLabel} schedule pressure before runs step on each other`
                    : 'Visualize schedule pressure and overall split before agents step on each other'}
                </h3>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300 md:text-[15px]">
                  The board now supports workspace lanes, agent-profile lanes, and a full schedule
                  atlas. Scan collision windows, find crowded profiles, and see when the system is
                  calm versus when it is about to stack too much runtime into the same slice.
                </p>
              </div>

              <div className="flex items-start justify-end">
                <button
                  onClick={onClose}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-background/40 text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground"
                  aria-label="Close schedule visualization"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <HeroMetric
                label="Visible schedules"
                value={visualization.visualizedSchedules.length}
                detail={`${visualization.enabledScheduleCount} enabled, ${visualization.pausedScheduleCount} paused`}
              />
              <HeroMetric
                label="Peak concurrency"
                value={visualization.peakConcurrentSchedules}
                detail="Highest number of active schedules in the same forecast slice."
                tone={visualization.peakConcurrentSchedules >= 3 ? 'warning' : 'default'}
              />
              <HeroMetric
                label="Workspace hotspots"
                value={visualization.highRiskWorkspaceCount}
                detail={`${visualization.totalConflictCount} overlap window${visualization.totalConflictCount === 1 ? '' : 's'} in workspace mode`}
                tone={visualization.highRiskWorkspaceCount > 0 ? 'destructive' : 'default'}
              />
              <HeroMetric
                label="Profile hotspots"
                value={visualization.highRiskProfileCount}
                detail={`${visualization.profileConflictCount} overlap window${visualization.profileConflictCount === 1 ? '' : 's'} in profile mode`}
                tone={visualization.highRiskProfileCount > 0 ? 'warning' : 'default'}
              />
              <HeroMetric
                label="Next launch"
                value={
                  visualization.nextRunTime
                    ? formatScheduleDate(visualization.nextRunTime)
                    : 'No launch'
                }
                detail={
                  visualization.nextRunTime
                    ? formatCountdown(visualization.nextRunTime)
                    : 'Nothing enabled with a projected next run.'
                }
                tone="default"
              />
            </div>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-5 md:px-7 md:py-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_360px]">
            <div className="space-y-6">
              <div className="rounded-[28px] border border-border/60 bg-background/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <p className="text-sm font-semibold">Choose your lens</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Switch between workspace risk, agent profile load, and the full board.
                    </p>
                  </div>
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
                      label="Timeline Board"
                      onClick={() => setMode('board')}
                    />
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search schedule, profile, prompt, cron, or workspace"
                    icon={<Search className="h-4 w-4" />}
                    className="h-11 rounded-2xl border-border/70 bg-card/70"
                    aria-label="Search schedules"
                  />
                  <Button
                    type="button"
                    variant={showPaused ? 'outline' : 'default'}
                    className="h-11 rounded-2xl px-4"
                    onClick={() => setShowPaused((current) => !current)}
                  >
                    {showPaused ? 'Hide paused schedules' : 'Show paused schedules'}
                  </Button>
                </div>
              </div>

              <LoadAtlas visualization={visualization} scopeLabel={scopeLabel} mode={mode} />

              {visualization.visualizedSchedules.length === 0 ? (
                <EmptyState
                  title={
                    schedules.length === 0
                      ? 'No schedules to visualize yet'
                      : 'No schedules match the current filters'
                  }
                  description={
                    schedules.length === 0
                      ? 'Create a schedule first, then come back here to explore overlap, profile pressure, and launch timing.'
                      : 'Try a broader search or re-enable paused schedules to bring more timelines back into view.'
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
                  title={`No ${mode === 'workspace' ? 'workspaces' : 'profiles'} match right now`}
                  description="The filter removed every group from this lens."
                />
              ) : (
                <div className="space-y-5">
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

            <div className="space-y-4">
              <InsightCard
                icon={<Sparkles className="h-5 w-5" />}
                title="Forecast pulse"
                body={
                  mode === 'workspace'
                    ? 'Workspace mode is best when you care about filesystem and branch collisions.'
                    : mode === 'profile'
                      ? 'Profile mode is best when one agent family could get overloaded or noisy.'
                      : 'Timeline board is best when you want the whole day to read like one control wall.'
                }
              />

              <InsightCard
                icon={<Clock3 className="h-5 w-5" />}
                title="Launch density"
                body={
                  visualization.activeBucketCount > 0
                    ? `${visualization.activeBucketCount} forecast slices show activity, and the busiest slice reaches ${visualization.peakConcurrentSchedules} concurrent schedule${visualization.peakConcurrentSchedules === 1 ? '' : 's'}.`
                    : 'No active slices are projected inside the current horizon.'
                }
              />

              <InsightCard
                icon={<Zap className="h-5 w-5" />}
                title="Operator focus"
                body={
                  visualization.limitedPreviewCount > 0
                    ? `${visualization.limitedPreviewCount} schedule forecast${visualization.limitedPreviewCount === 1 ? '' : 's'} are limited because they rely on advanced cron or missing next-run data.`
                    : 'Every visible schedule has enough data to build a normal forecast window.'
                }
              />

              <div className="rounded-[28px] border border-border/60 bg-background/70 p-5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <p className="text-sm font-semibold">Hotspots to review</p>
                </div>
                <div className="mt-4 space-y-3">
                  {rankedGroups.length > 0 ? (
                    rankedGroups.map((group) => (
                      <div
                        key={getGroupKey(group)}
                        className="rounded-2xl border border-border/60 bg-card/60 px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">{getGroupLabel(group)}</p>
                          <RiskBadge risk={group.risk} compact />
                        </div>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          {group.summary}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No hotspots in this filtered view.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-[28px] border border-border/60 bg-background/70 p-5">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold">Legend</p>
                </div>
                <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                  <LegendRow
                    swatchClass="bg-success/20 border-success/30"
                    label="Low risk: one enabled schedule or a clean timeline."
                  />
                  <LegendRow
                    swatchClass="bg-warning/20 border-warning/30"
                    label="Medium risk: shared surface without an actual overlap window."
                  />
                  <LegendRow
                    swatchClass="bg-destructive/20 border-destructive/30"
                    label="High risk: overlapping timeout windows are projected."
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-border/60 bg-background/85 px-5 py-4 md:px-7">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

function HeroMetric({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  detail: string;
  tone?: 'default' | 'warning' | 'destructive';
}) {
  return (
    <div
      className={cn(
        'rounded-[24px] border px-4 py-4 backdrop-blur-sm',
        tone === 'destructive'
          ? 'border-destructive/20 bg-destructive/10'
          : tone === 'warning'
            ? 'border-warning/20 bg-warning/10'
            : 'border-white/10 bg-white/5'
      )}
    >
      <p className="text-[11px] uppercase tracking-[0.24em] text-slate-300">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-400">{detail}</p>
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
    <Button
      type="button"
      size="sm"
      variant={active ? 'default' : 'outline'}
      onClick={onClick}
      className={cn('rounded-full px-4', active ? 'shadow-lg' : 'bg-card/60')}
    >
      {icon}
      {label}
    </Button>
  );
}

function LoadAtlas({
  visualization,
  scopeLabel,
  mode,
}: {
  visualization: ScheduleVisualizationModel;
  scopeLabel?: string;
  mode: VisualizationMode;
}) {
  const maxConcurrent = Math.max(
    1,
    ...visualization.loadBuckets.map((bucket) => bucket.activeScheduleCount)
  );
  const labelStep = Math.max(1, Math.floor(visualization.loadBuckets.length / 4));

  return (
    <div className="overflow-hidden rounded-[30px] border border-border/60 bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(15,23,42,0.7))]">
      <div className="flex flex-col gap-4 border-b border-border/60 px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-[11px] uppercase tracking-[0.24em] text-primary/80">Load Atlas</p>
          <h4 className="mt-2 text-xl font-semibold tracking-tight">
            {scopeLabel
              ? `${scopeLabel} now has a proper control-room view`
              : 'A cleaner schedule panorama across the full horizon'}
          </h4>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {mode === 'workspace'
              ? 'Read this as workspace pressure over time, then drop into the individual cards below.'
              : mode === 'profile'
                ? 'Read this as agent-profile pressure over time, then inspect each profile lane underneath.'
                : 'Read this as the master timeline wall for every visible schedule.'}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <AtlasStat
            label="Active slices"
            value={visualization.activeBucketCount}
            detail="Slices with at least one active run or launch."
          />
          <AtlasStat
            label="Peak launches"
            value={visualization.peakLaunchCount}
            detail="Most launches starting in the same slice."
          />
          <AtlasStat
            label="Profiles in play"
            value={visualization.profileCount}
            detail="Distinct agent profiles visible in the forecast."
          />
        </div>
      </div>

      <div className="px-5 py-5">
        <div className="grid grid-cols-12 gap-2 md:grid-cols-24">
          {visualization.loadBuckets.map((bucket, index) => {
            const height = Math.max((bucket.activeScheduleCount / maxConcurrent) * 136, 10);

            return (
              <div key={`${bucket.startMs}-${bucket.endMs}`} className="space-y-2">
                <div className="flex h-40 flex-col items-center justify-end">
                  <div className="relative flex h-full w-full items-end rounded-[22px] border border-border/60 bg-background/60 px-1.5 py-2">
                    <div
                      className={cn(
                        'w-full rounded-[16px] border transition-all duration-300',
                        bucket.risk === 'high'
                          ? 'border-destructive/40 bg-destructive/30 shadow-[0_0_30px_rgba(239,68,68,0.22)]'
                          : bucket.risk === 'medium'
                            ? 'border-warning/40 bg-warning/25 shadow-[0_0_24px_rgba(234,179,8,0.18)]'
                            : 'border-primary/30 bg-primary/20'
                      )}
                      style={{ height }}
                      title={`${bucket.activeScheduleCount} active schedule${bucket.activeScheduleCount === 1 ? '' : 's'}, ${bucket.launchCount} launch${bucket.launchCount === 1 ? '' : 'es'}`}
                    />
                    {bucket.launchCount > 0 ? (
                      <div className="absolute inset-x-1.5 top-2 flex justify-center">
                        <span className="rounded-full border border-white/10 bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          {bucket.launchCount}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
                {index % labelStep === 0 || index === visualization.loadBuckets.length - 1 ? (
                  <p className="text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {new Date(bucket.startMs).toLocaleTimeString([], {
                      hour: 'numeric',
                    })}
                  </p>
                ) : (
                  <div className="h-[14px]" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AtlasStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
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
  const buckets = buildEntryBuckets(
    group.schedules,
    visualization.horizonStartMs,
    visualization.horizonEndMs
  );
  const maxConcurrent = Math.max(1, ...buckets.map((bucket) => bucket.activeScheduleCount));

  return (
    <div className="overflow-hidden rounded-[30px] border border-border/60 bg-background/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="relative overflow-hidden border-b border-border/60 px-5 py-5">
        <div
          className={cn(
            'absolute inset-0 opacity-90',
            group.risk === 'high'
              ? 'bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.16),transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(15,23,42,0.75))]'
              : group.risk === 'medium'
                ? 'bg-[radial-gradient(circle_at_top_left,rgba(234,179,8,0.15),transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(15,23,42,0.75))]'
                : 'bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.16),transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(15,23,42,0.75))]'
          )}
        />

        <div className="relative flex flex-col gap-5 xl:grid xl:grid-cols-[minmax(0,1.4fr)_minmax(0,320px)] xl:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                {grouping === 'workspace' ? (
                  <>
                    <Folder className="h-3.5 w-3.5" />
                    Workspace lens
                  </>
                ) : (
                  <>
                    <Bot className="h-3.5 w-3.5" />
                    Agent profile lens
                  </>
                )}
              </Badge>
              <RiskBadge risk={group.risk} />
              <Badge variant="outline">{group.enabledCount} enabled</Badge>
              {group.pausedCount > 0 ? (
                <Badge variant="warning">{group.pausedCount} paused</Badge>
              ) : null}
              {group.conflictCount > 0 ? (
                <Badge variant="destructive">
                  {group.conflictCount} conflict window{group.conflictCount === 1 ? '' : 's'}
                </Badge>
              ) : null}
            </div>

            <h4 className="mt-4 text-xl font-semibold tracking-tight break-all">
              {getGroupLabel(group)}
            </h4>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{group.summary}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="outline">{group.projectedRuntimeMinutes} projected runtime min</Badge>
              <Badge variant="outline">
                {grouping === 'workspace'
                  ? `${group.uniqueProfileCount} profile${group.uniqueProfileCount === 1 ? '' : 's'}`
                  : `${group.uniqueWorkspaceCount} workspace${group.uniqueWorkspaceCount === 1 ? '' : 's'}`}
              </Badge>
              <Badge variant="outline">
                {group.schedules.length} schedule{group.schedules.length === 1 ? '' : 's'}
              </Badge>
            </div>
          </div>

          <div className="rounded-[24px] border border-border/60 bg-background/70 p-4">
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Group rhythm
            </p>
            <div className="mt-4 grid grid-cols-12 gap-1.5">
              {buckets.map((bucket) => (
                <div
                  key={`${bucket.startMs}-${bucket.endMs}`}
                  className="flex h-24 items-end rounded-full bg-muted/20 px-0.5 py-1"
                >
                  <div
                    className={cn(
                      'w-full rounded-full border',
                      bucket.risk === 'high'
                        ? 'border-destructive/40 bg-destructive/30'
                        : bucket.risk === 'medium'
                          ? 'border-warning/40 bg-warning/25'
                          : 'border-primary/30 bg-primary/20'
                    )}
                    style={{
                      height: `${Math.max((bucket.activeScheduleCount / maxConcurrent) * 100, 10)}%`,
                    }}
                  />
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Peaks reflect how many schedules in this {grouping} may still be active in the same
              slice.
            </p>
          </div>
        </div>
      </div>

      <div className="px-5 py-5">
        <div
          className={cn(
            'grid gap-4 text-[11px] uppercase tracking-[0.22em] text-muted-foreground',
            grouping === 'workspace'
              ? 'xl:grid-cols-[minmax(0,260px)_minmax(0,1fr)_170px]'
              : 'xl:grid-cols-[minmax(0,260px)_minmax(0,1fr)_170px]'
          )}
        >
          <div>Schedule</div>
          <div className="grid grid-cols-5 gap-2">
            {['Now', '+6h', '+12h', '+18h', '+24h'].map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div>Next / Timeout</div>
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

        <div className="mt-5">
          {group.conflicts.length > 0 ? (
            <ConflictPanel conflicts={group.conflicts} />
          ) : (
            <div className="rounded-[24px] border border-success/20 bg-success/5 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-success" />
                <div>
                  <p className="text-sm font-semibold">No overlap predicted in this lane</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    The current forecast does not show timeout windows colliding in this{' '}
                    {grouping === 'workspace' ? 'workspace' : 'profile'}.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
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
    <div className="overflow-hidden rounded-[30px] border border-border/60 bg-background/75">
      <div className="flex flex-col gap-4 border-b border-border/60 px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
            Timeline board
          </Badge>
          <h4 className="mt-3 text-xl font-semibold tracking-tight">Every schedule, one wall</h4>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            This is the broadest read of the system. Use it to understand distribution first, then
            jump back to workspace or profile lanes to resolve pressure pockets.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{visualization.workspaceCount} workspaces</Badge>
          <Badge variant="outline">{visualization.profileCount} profiles</Badge>
          <Badge variant="outline">{visualization.enabledScheduleCount} enabled</Badge>
        </div>
      </div>

      <div className="px-5 py-5">
        <div className="grid gap-4 text-[11px] uppercase tracking-[0.22em] text-muted-foreground xl:grid-cols-[minmax(0,240px)_minmax(0,170px)_minmax(0,160px)_minmax(0,1fr)_170px]">
          <div>Schedule</div>
          <div>Profile</div>
          <div>Workspace</div>
          <div className="grid grid-cols-5 gap-2">
            {['Now', '+6h', '+12h', '+18h', '+24h'].map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div>Next / Timeout</div>
        </div>

        <div className="mt-4 space-y-4">
          {visualization.visualizedSchedules.map((entry) => (
            <div
              key={entry.schedule._id}
              className={cn(
                'grid gap-4 rounded-[24px] border border-border/60 px-4 py-4 xl:grid-cols-[minmax(0,240px)_minmax(0,170px)_minmax(0,160px)_minmax(0,1fr)_170px]',
                entry.schedule.enabled ? 'bg-card/60' : 'bg-muted/15'
              )}
            >
              <ScheduleMeta entry={entry} promptMap={promptMap} profileMap={profileMap} />
              <GroupReference label={entry.profileLabel} risk={undefined} />
              <GroupReference
                label={entry.workspaceLabel}
                risk={getScheduleWorkspaceRisk(entry, visualization)}
              />
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
        'grid gap-4 rounded-[26px] border border-border/60 px-4 py-4 xl:grid-cols-[minmax(0,260px)_minmax(0,1fr)_170px]',
        entry.schedule.enabled ? 'bg-card/55' : 'bg-muted/15'
      )}
    >
      <div className="min-w-0 space-y-3">
        <ScheduleMeta entry={entry} promptMap={promptMap} profileMap={profileMap} />
        <div className="flex flex-wrap gap-2">
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
      <p className="text-xs leading-5 text-muted-foreground">
        {humanizeCron(entry.schedule.cronExpression)}
      </p>
      <div className="space-y-1 text-xs leading-5 text-muted-foreground">
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
      <div className="relative h-16 overflow-hidden rounded-[22px] border border-border/60 bg-[linear-gradient(180deg,rgba(15,23,42,0.76),rgba(2,6,23,0.96))]">
        <div className="absolute inset-y-0 left-0 border-l border-white/70" />
        {[20, 40, 60, 80].map((offset) => (
          <div
            key={offset}
            className="absolute inset-y-0 border-l border-white/8"
            style={{ left: `${offset}%` }}
          />
        ))}

        {entry.timelineWindows.length > 0 ? (
          entry.timelineWindows.map((window, index) => {
            const left = ((window.startMs - horizonStartMs) / horizonMs) * 100;
            const width = Math.max(((window.endMs - window.startMs) / horizonMs) * 100, 1.5);

            return (
              <div
                key={`${entry.schedule._id}-${index}`}
                className={cn(
                  'absolute top-1/2 h-7 -translate-y-1/2 rounded-full border shadow-[0_0_24px_rgba(99,102,241,0.2)]',
                  tone === 'warning'
                    ? 'border-warning/40 bg-warning/30 shadow-[0_0_30px_rgba(234,179,8,0.22)]'
                    : 'border-primary/40 bg-primary/30'
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
    <div className="rounded-[22px] border border-border/60 bg-background/60 px-4 py-3 text-sm">
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
      <p className="mt-3 text-xs text-muted-foreground">Projected runtime</p>
      <p className="mt-1 font-medium">{entry.projectedRuntimeMinutes} min</p>
    </div>
  );
}

function GroupReference({ label, risk }: { label: string; risk?: ScheduleVisualizationRisk }) {
  return (
    <div className="min-w-0 rounded-[22px] border border-border/60 bg-background/60 px-3 py-3">
      <p className="break-all text-xs leading-5">{label}</p>
      {risk ? (
        <div className="mt-2">
          <RiskBadge risk={risk} compact />
        </div>
      ) : null}
    </div>
  );
}

function ConflictPanel({ conflicts }: { conflicts: ScheduleConflictWindow[] }) {
  return (
    <div className="rounded-[24px] border border-destructive/20 bg-destructive/5 p-4">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Predicted overlap windows</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            These are the moments where timeout windows may still be active at the same time.
          </p>
          <div className="mt-4 space-y-2">
            {conflicts.slice(0, 4).map((conflict, index) => (
              <div
                key={`${conflict.startMs}-${conflict.endMs}-${index}`}
                className="rounded-2xl border border-border/60 bg-background/70 px-3 py-3"
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

function RiskBadge({
  risk,
  compact = false,
}: {
  risk: ScheduleVisualizationRisk;
  compact?: boolean;
}) {
  if (risk === 'high') {
    return <Badge variant="destructive">{compact ? 'High' : 'High collision risk'}</Badge>;
  }
  if (risk === 'medium') {
    return <Badge variant="warning">{compact ? 'Medium' : 'Shared surface'}</Badge>;
  }
  return <Badge variant="success">{compact ? 'Low' : 'Low collision risk'}</Badge>;
}

function InsightCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[28px] border border-border/60 bg-background/70 p-5">
      <div className="flex items-center gap-2">
        <div className="rounded-full border border-primary/20 bg-primary/10 p-2 text-primary">
          {icon}
        </div>
        <p className="text-sm font-semibold">{title}</p>
      </div>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}

function LegendRow({ swatchClass, label }: { swatchClass: string; label: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className={cn('mt-1 h-3.5 w-3.5 rounded-full border', swatchClass)} />
      <p className="leading-6">{label}</p>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[30px] border border-dashed border-primary/25 bg-gradient-to-br from-primary/8 via-background to-warning/8 px-6 py-16 text-center">
      <Sparkles className="mx-auto h-11 w-11 text-primary/80" />
      <h4 className="mt-4 text-xl font-semibold tracking-tight">{title}</h4>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function buildEntryBuckets(
  schedules: VisualizedSchedule[],
  horizonStartMs: number,
  horizonEndMs: number
): ScheduleLoadBucket[] {
  const bucketCount = 12;
  const bucketDurationMs = (horizonEndMs - horizonStartMs) / bucketCount;

  return Array.from({ length: bucketCount }, (_, index) => {
    const startMs = Math.round(horizonStartMs + index * bucketDurationMs);
    const endMs =
      index === bucketCount - 1
        ? horizonEndMs
        : Math.round(horizonStartMs + (index + 1) * bucketDurationMs);
    const overlapping = schedules.filter((schedule) =>
      schedule.occurrences.some(
        (occurrence) => occurrence.endMs > startMs && occurrence.startMs < endMs
      )
    );
    const launches = schedules.filter((schedule) =>
      schedule.occurrences.some(
        (occurrence) => occurrence.startMs >= startMs && occurrence.startMs < endMs
      )
    );

    return {
      startMs,
      endMs,
      activeScheduleCount: overlapping.length,
      launchCount: launches.length,
      uniqueWorkspaceCount: new Set(overlapping.map((schedule) => schedule.workspaceKey)).size,
      uniqueProfileCount: new Set(overlapping.map((schedule) => schedule.profileKey)).size,
      risk: overlapping.length >= 3 ? 'high' : overlapping.length >= 2 ? 'medium' : 'low',
    };
  });
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

function getGroupKey(group: WorkspaceVisualization | ProfileVisualization): string {
  return 'workspaceKey' in group ? group.workspaceKey : group.profileKey;
}

function getGroupLabel(group: WorkspaceVisualization | ProfileVisualization): string {
  return 'workspaceLabel' in group ? group.workspaceLabel : group.profileLabel;
}
