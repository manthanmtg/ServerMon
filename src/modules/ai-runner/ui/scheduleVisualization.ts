import type { AIRunnerProfileDTO, AIRunnerScheduleDTO } from '../types';
import { parseScheduleBuilder } from './utils';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const DEFAULT_HORIZON_HOURS = 24;
const MAX_OCCURRENCES_PER_SCHEDULE = 1_500;
const UNASSIGNED_WORKSPACE_KEY = '__unassigned_workspace__';
const UNASSIGNED_WORKSPACE_LABEL = 'No workspace assigned';
const UNASSIGNED_PROFILE_KEY = '__unassigned_profile__';
const UNASSIGNED_PROFILE_LABEL = 'No agent profile assigned';

export type ScheduleVisualizationRisk = 'low' | 'medium' | 'high';

export interface ScheduleTimelineOccurrence {
  startMs: number;
  endMs: number;
}

export interface ScheduleTimelineWindow {
  startMs: number;
  endMs: number;
  occurrenceCount: number;
}

export interface VisualizedSchedule {
  schedule: AIRunnerScheduleDTO;
  workspaceKey: string;
  workspaceLabel: string;
  profileKey: string;
  profileLabel: string;
  occurrences: ScheduleTimelineOccurrence[];
  timelineWindows: ScheduleTimelineWindow[];
  previewLimited: boolean;
  projectedRuntimeMinutes: number;
}

export interface ScheduleConflictWindow {
  startMs: number;
  endMs: number;
  scheduleIds: string[];
  scheduleNames: string[];
  severity: ScheduleVisualizationRisk;
  kind: 'self-overlap' | 'multi-schedule';
}

export type WorkspaceConflictWindow = ScheduleConflictWindow;
export type ProfileConflictWindow = ScheduleConflictWindow;

interface BaseGroupVisualization {
  schedules: VisualizedSchedule[];
  enabledCount: number;
  pausedCount: number;
  conflictCount: number;
  risk: ScheduleVisualizationRisk;
  conflicts: ScheduleConflictWindow[];
  summary: string;
  uniqueWorkspaceCount: number;
  uniqueProfileCount: number;
  projectedRuntimeMinutes: number;
  nextRunTime?: string;
}

export interface WorkspaceVisualization extends BaseGroupVisualization {
  workspaceKey: string;
  workspaceLabel: string;
}

export interface ProfileVisualization extends BaseGroupVisualization {
  profileKey: string;
  profileLabel: string;
}

export interface ScheduleLoadBucket {
  startMs: number;
  endMs: number;
  activeScheduleCount: number;
  launchCount: number;
  uniqueWorkspaceCount: number;
  uniqueProfileCount: number;
  risk: ScheduleVisualizationRisk;
}

export interface ScheduleVisualizationModel {
  workspaceCount: number;
  profileCount: number;
  enabledScheduleCount: number;
  pausedScheduleCount: number;
  highRiskWorkspaceCount: number;
  highRiskProfileCount: number;
  limitedPreviewCount: number;
  totalConflictCount: number;
  profileConflictCount: number;
  peakConcurrentSchedules: number;
  peakLaunchCount: number;
  activeBucketCount: number;
  nextRunTime?: string;
  horizonStartMs: number;
  horizonEndMs: number;
  visualizedSchedules: VisualizedSchedule[];
  workspaces: WorkspaceVisualization[];
  profiles: ProfileVisualization[];
  loadBuckets: ScheduleLoadBucket[];
}

interface BuildScheduleVisualizationOptions {
  now?: number;
  horizonHours?: number;
  profileMap?: Record<string, Pick<AIRunnerProfileDTO, 'name'>>;
}

interface ScheduleOccurrenceDescriptor extends ScheduleTimelineOccurrence {
  scheduleId: string;
  scheduleName: string;
  workspaceKey: string;
  profileKey: string;
}

export function buildScheduleVisualizationModel(
  schedules: AIRunnerScheduleDTO[],
  now?: number,
  horizonHours?: number
): ScheduleVisualizationModel;
export function buildScheduleVisualizationModel(
  schedules: AIRunnerScheduleDTO[],
  options?: BuildScheduleVisualizationOptions
): ScheduleVisualizationModel;
export function buildScheduleVisualizationModel(
  schedules: AIRunnerScheduleDTO[],
  nowOrOptions?: number | BuildScheduleVisualizationOptions,
  horizonHours = DEFAULT_HORIZON_HOURS
): ScheduleVisualizationModel {
  const options =
    typeof nowOrOptions === 'number' || typeof nowOrOptions === 'undefined'
      ? {
          now: nowOrOptions ?? Date.now(),
          horizonHours,
          profileMap: undefined,
        }
      : {
          now: nowOrOptions.now ?? Date.now(),
          horizonHours: nowOrOptions.horizonHours ?? DEFAULT_HORIZON_HOURS,
          profileMap: nowOrOptions.profileMap,
        };

  const horizonStartMs = options.now;
  const horizonEndMs = options.now + options.horizonHours * HOUR_MS;
  const visualizedSchedules = schedules
    .map((schedule) =>
      visualizeSchedule(schedule, horizonStartMs, horizonEndMs, options.profileMap)
    )
    .sort(compareVisualizedSchedules);

  const workspaceGroups = groupVisualizedSchedules(visualizedSchedules, 'workspace');
  const profileGroups = groupVisualizedSchedules(visualizedSchedules, 'profile');

  const workspaces = Array.from(workspaceGroups.entries())
    .map(([workspaceKey, groupedSchedules]) =>
      buildWorkspaceVisualization(workspaceKey, groupedSchedules)
    )
    .sort(compareGroupsByRisk);

  const profiles = Array.from(profileGroups.entries())
    .map(([profileKey, groupedSchedules]) =>
      buildProfileVisualization(profileKey, groupedSchedules)
    )
    .sort(compareGroupsByRisk);

  const allOccurrences = visualizedSchedules.flatMap(mapScheduleToConflictDescriptors);
  const loadBuckets = buildLoadBuckets(allOccurrences, horizonStartMs, horizonEndMs);
  const peakConcurrentSchedules = loadBuckets.reduce(
    (peak, bucket) => Math.max(peak, bucket.activeScheduleCount),
    0
  );
  const peakLaunchCount = loadBuckets.reduce(
    (peak, bucket) => Math.max(peak, bucket.launchCount),
    0
  );

  return {
    workspaceCount: workspaces.length,
    profileCount: profiles.length,
    enabledScheduleCount: schedules.filter((schedule) => schedule.enabled).length,
    pausedScheduleCount: schedules.filter((schedule) => !schedule.enabled).length,
    highRiskWorkspaceCount: workspaces.filter((workspace) => workspace.risk === 'high').length,
    highRiskProfileCount: profiles.filter((profile) => profile.risk === 'high').length,
    limitedPreviewCount: visualizedSchedules.filter((schedule) => schedule.previewLimited).length,
    totalConflictCount: workspaces.reduce((total, workspace) => total + workspace.conflictCount, 0),
    profileConflictCount: profiles.reduce((total, profile) => total + profile.conflictCount, 0),
    peakConcurrentSchedules,
    peakLaunchCount,
    activeBucketCount: loadBuckets.filter(
      (bucket) => bucket.activeScheduleCount > 0 || bucket.launchCount > 0
    ).length,
    nextRunTime: getNextRunTime(visualizedSchedules),
    horizonStartMs,
    horizonEndMs,
    visualizedSchedules,
    workspaces,
    profiles,
    loadBuckets,
  };
}

function visualizeSchedule(
  schedule: AIRunnerScheduleDTO,
  horizonStartMs: number,
  horizonEndMs: number,
  profileMap?: Record<string, Pick<AIRunnerProfileDTO, 'name'>>
): VisualizedSchedule {
  const workspaceKey = normalizeWorkspaceKey(schedule.workingDirectory);
  const profileKey = normalizeProfileKey(schedule.agentProfileId);
  const occurrences = buildOccurrences(schedule, horizonStartMs, horizonEndMs);
  const timelineWindows = mergeTimelineWindows(occurrences, horizonStartMs, horizonEndMs);

  return {
    schedule,
    workspaceKey,
    workspaceLabel:
      workspaceKey === UNASSIGNED_WORKSPACE_KEY ? UNASSIGNED_WORKSPACE_LABEL : workspaceKey,
    profileKey,
    profileLabel: getProfileLabel(profileKey, profileMap),
    occurrences,
    timelineWindows,
    previewLimited: schedule.enabled && isPreviewLimited(schedule),
    projectedRuntimeMinutes: Math.round(
      timelineWindows.reduce((total, window) => total + (window.endMs - window.startMs), 0) /
        MINUTE_MS
    ),
  };
}

function buildOccurrences(
  schedule: AIRunnerScheduleDTO,
  horizonStartMs: number,
  horizonEndMs: number
): ScheduleTimelineOccurrence[] {
  if (!schedule.enabled) {
    return [];
  }

  const firstOccurrence = getFirstOccurrence(schedule, horizonStartMs);
  if (!firstOccurrence) {
    return [];
  }

  const timeoutMs = Math.max(schedule.timeout, 1) * MINUTE_MS;
  const parsed = parseScheduleBuilder(schedule.cronExpression);
  const occurrences: ScheduleTimelineOccurrence[] = [];

  let current: Date | null = firstOccurrence;
  let iterations = 0;

  while (current && current.getTime() < horizonEndMs && iterations < MAX_OCCURRENCES_PER_SCHEDULE) {
    const startMs = current.getTime();
    const endMs = startMs + timeoutMs;
    if (endMs > horizonStartMs) {
      occurrences.push({ startMs, endMs });
    }
    current = getNextOccurrence(current, parsed);
    iterations += 1;
  }

  return occurrences;
}

function getFirstOccurrence(schedule: AIRunnerScheduleDTO, horizonStartMs: number): Date | null {
  if (schedule.nextRunTime) {
    const nextRun = new Date(schedule.nextRunTime);
    if (!Number.isNaN(nextRun.getTime())) {
      return nextRun;
    }
  }

  const parsed = parseScheduleBuilder(schedule.cronExpression);
  return computeNextOccurrenceFromNow(parsed, horizonStartMs);
}

function computeNextOccurrenceFromNow(
  parsed: ReturnType<typeof parseScheduleBuilder>,
  horizonStartMs: number
): Date | null {
  const now = new Date(horizonStartMs);
  const minuteStart = new Date(now);
  minuteStart.setSeconds(0, 0);
  if (minuteStart.getTime() < horizonStartMs) {
    minuteStart.setMinutes(minuteStart.getMinutes() + 1);
  }

  if (parsed.mode === 'every') {
    if (parsed.interval === 1) {
      return minuteStart;
    }
    const next = new Date(minuteStart);
    while (next.getTime() < horizonStartMs || next.getMinutes() % parsed.interval !== 0) {
      next.setMinutes(next.getMinutes() + 1);
    }
    return next;
  }

  if (parsed.mode === 'hourly') {
    const next = new Date(minuteStart);
    next.setMinutes(parsed.minute, 0, 0);
    if (next.getTime() < horizonStartMs) {
      next.setHours(next.getHours() + 1);
    }
    return next;
  }

  if (parsed.mode === 'daily') {
    const next = new Date(minuteStart);
    next.setHours(parsed.hour, parsed.minute, 0, 0);
    if (next.getTime() < horizonStartMs) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }

  if (parsed.mode === 'weekly') {
    const next = new Date(minuteStart);
    for (let offset = 0; offset < 8; offset += 1) {
      const candidate = new Date(next);
      candidate.setDate(next.getDate() + offset);
      candidate.setHours(parsed.hour, parsed.minute, 0, 0);
      if (candidate.getTime() >= horizonStartMs && parsed.days.includes(candidate.getDay())) {
        return candidate;
      }
    }
    return null;
  }

  if (parsed.mode === 'monthly') {
    const next = new Date(minuteStart);
    for (let offset = 0; offset < 14; offset += 1) {
      const candidate = new Date(
        next.getFullYear(),
        next.getMonth() + offset,
        parsed.dayOfMonth,
        parsed.hour,
        parsed.minute,
        0,
        0
      );
      if (candidate.getDate() !== parsed.dayOfMonth) {
        continue;
      }
      if (candidate.getTime() >= horizonStartMs) {
        return candidate;
      }
    }
    return null;
  }

  return null;
}

function getNextOccurrence(
  current: Date,
  parsed: ReturnType<typeof parseScheduleBuilder>
): Date | null {
  if (parsed.mode === 'every') {
    return new Date(current.getTime() + parsed.interval * MINUTE_MS);
  }

  if (parsed.mode === 'hourly') {
    return new Date(current.getTime() + HOUR_MS);
  }

  if (parsed.mode === 'daily') {
    return new Date(current.getTime() + DAY_MS);
  }

  if (parsed.mode === 'weekly') {
    const next = new Date(current);
    next.setDate(next.getDate() + 1);
    next.setHours(parsed.hour, parsed.minute, 0, 0);
    while (!parsed.days.includes(next.getDay())) {
      next.setDate(next.getDate() + 1);
      next.setHours(parsed.hour, parsed.minute, 0, 0);
    }
    return next;
  }

  if (parsed.mode === 'monthly') {
    const next = new Date(current);
    for (let offset = 1; offset < 14; offset += 1) {
      const candidate = new Date(
        next.getFullYear(),
        next.getMonth() + offset,
        parsed.dayOfMonth,
        parsed.hour,
        parsed.minute,
        0,
        0
      );
      if (candidate.getDate() === parsed.dayOfMonth) {
        return candidate;
      }
    }
    return null;
  }

  return null;
}

function mergeTimelineWindows(
  occurrences: ScheduleTimelineOccurrence[],
  horizonStartMs: number,
  horizonEndMs: number
): ScheduleTimelineWindow[] {
  const windows: ScheduleTimelineWindow[] = [];

  for (const occurrence of occurrences) {
    const startMs = Math.max(occurrence.startMs, horizonStartMs);
    const endMs = Math.min(occurrence.endMs, horizonEndMs);
    if (endMs <= startMs) {
      continue;
    }

    const previous = windows[windows.length - 1];
    if (previous && startMs <= previous.endMs) {
      previous.endMs = Math.max(previous.endMs, endMs);
      previous.occurrenceCount += 1;
      continue;
    }

    windows.push({ startMs, endMs, occurrenceCount: 1 });
  }

  return windows;
}

function buildWorkspaceVisualization(
  workspaceKey: string,
  schedules: VisualizedSchedule[]
): WorkspaceVisualization {
  const base = buildGroupVisualization(schedules, 'workspace');

  return {
    workspaceKey,
    workspaceLabel:
      workspaceKey === UNASSIGNED_WORKSPACE_KEY ? UNASSIGNED_WORKSPACE_LABEL : workspaceKey,
    ...base,
  };
}

function buildProfileVisualization(
  profileKey: string,
  schedules: VisualizedSchedule[]
): ProfileVisualization {
  const base = buildGroupVisualization(schedules, 'profile');

  return {
    profileKey,
    profileLabel: schedules[0]?.profileLabel ?? UNASSIGNED_PROFILE_LABEL,
    ...base,
  };
}

function buildGroupVisualization(
  schedules: VisualizedSchedule[],
  grouping: 'workspace' | 'profile'
): BaseGroupVisualization {
  const groupedSchedules = [...schedules].sort(compareVisualizedSchedules);
  const enabledCount = groupedSchedules.filter((schedule) => schedule.schedule.enabled).length;
  const pausedCount = groupedSchedules.length - enabledCount;
  const conflicts = buildConflicts(groupedSchedules.flatMap(mapScheduleToConflictDescriptors));
  const risk = conflicts.length > 0 ? 'high' : enabledCount > 1 ? 'medium' : 'low';
  const uniqueWorkspaceCount = new Set(groupedSchedules.map((schedule) => schedule.workspaceKey))
    .size;
  const uniqueProfileCount = new Set(groupedSchedules.map((schedule) => schedule.profileKey)).size;

  return {
    schedules: groupedSchedules,
    enabledCount,
    pausedCount,
    conflictCount: conflicts.length,
    risk,
    conflicts,
    summary:
      grouping === 'workspace'
        ? buildWorkspaceSummary(
            enabledCount,
            pausedCount,
            conflicts.length,
            risk,
            uniqueProfileCount
          )
        : buildProfileSummary(
            enabledCount,
            pausedCount,
            conflicts.length,
            risk,
            uniqueWorkspaceCount
          ),
    uniqueWorkspaceCount,
    uniqueProfileCount,
    projectedRuntimeMinutes: groupedSchedules.reduce(
      (total, schedule) => total + schedule.projectedRuntimeMinutes,
      0
    ),
    nextRunTime: getNextRunTime(groupedSchedules),
  };
}

function buildConflicts(occurrences: ScheduleOccurrenceDescriptor[]): ScheduleConflictWindow[] {
  const events = occurrences.flatMap((occurrence) => [
    {
      type: 'start' as const,
      at: occurrence.startMs,
      occurrence,
    },
    {
      type: 'end' as const,
      at: occurrence.endMs,
      occurrence,
    },
  ]);

  events.sort((left, right) => {
    if (left.at !== right.at) return left.at - right.at;
    if (left.type === right.type) return 0;
    return left.type === 'end' ? -1 : 1;
  });

  const conflicts: ScheduleConflictWindow[] = [];
  const active = new Map<string, { scheduleName: string; count: number }>();
  let previousAt: number | null = null;

  for (const event of events) {
    if (previousAt !== null && event.at > previousAt && getActiveOccurrenceCount(active) > 1) {
      const scheduleIds = Array.from(active.keys()).sort((left, right) =>
        left.localeCompare(right)
      );
      const scheduleNames = scheduleIds.map(
        (scheduleId) => active.get(scheduleId)?.scheduleName ?? scheduleId
      );

      conflicts.push({
        startMs: previousAt,
        endMs: event.at,
        scheduleIds,
        scheduleNames,
        severity: getConflictSeverity(active),
        kind: scheduleIds.length === 1 ? 'self-overlap' : 'multi-schedule',
      });
    }

    if (event.type === 'start') {
      const current = active.get(event.occurrence.scheduleId);
      active.set(event.occurrence.scheduleId, {
        scheduleName: event.occurrence.scheduleName,
        count: (current?.count ?? 0) + 1,
      });
    } else {
      const current = active.get(event.occurrence.scheduleId);
      if (!current) {
        previousAt = event.at;
        continue;
      }
      if (current.count <= 1) {
        active.delete(event.occurrence.scheduleId);
      } else {
        active.set(event.occurrence.scheduleId, {
          scheduleName: current.scheduleName,
          count: current.count - 1,
        });
      }
    }

    previousAt = event.at;
  }

  return mergeConflictWindows(conflicts);
}

function buildLoadBuckets(
  occurrences: ScheduleOccurrenceDescriptor[],
  horizonStartMs: number,
  horizonEndMs: number
): ScheduleLoadBucket[] {
  const totalHours = Math.max(1, Math.round((horizonEndMs - horizonStartMs) / HOUR_MS));
  const bucketCount = Math.min(totalHours, 24);
  const bucketDurationMs = (horizonEndMs - horizonStartMs) / bucketCount;
  const buckets: ScheduleLoadBucket[] = [];

  for (let index = 0; index < bucketCount; index += 1) {
    const startMs = Math.round(horizonStartMs + index * bucketDurationMs);
    const endMs =
      index === bucketCount - 1
        ? horizonEndMs
        : Math.round(horizonStartMs + (index + 1) * bucketDurationMs);

    const overlapping = occurrences.filter(
      (occurrence) => occurrence.endMs > startMs && occurrence.startMs < endMs
    );
    const activeScheduleIds = new Set(overlapping.map((occurrence) => occurrence.scheduleId));
    const launches = occurrences.filter(
      (occurrence) => occurrence.startMs >= startMs && occurrence.startMs < endMs
    );
    const workspaceKeys = new Set(overlapping.map((occurrence) => occurrence.workspaceKey));
    const profileKeys = new Set(overlapping.map((occurrence) => occurrence.profileKey));

    buckets.push({
      startMs,
      endMs,
      activeScheduleCount: activeScheduleIds.size,
      launchCount: launches.length,
      uniqueWorkspaceCount: workspaceKeys.size,
      uniqueProfileCount: profileKeys.size,
      risk: activeScheduleIds.size >= 3 ? 'high' : activeScheduleIds.size >= 2 ? 'medium' : 'low',
    });
  }

  return buckets;
}

function mergeConflictWindows(conflicts: ScheduleConflictWindow[]): ScheduleConflictWindow[] {
  const merged: ScheduleConflictWindow[] = [];

  for (const conflict of conflicts) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.endMs === conflict.startMs &&
      previous.kind === conflict.kind &&
      previous.scheduleIds.join('|') === conflict.scheduleIds.join('|')
    ) {
      previous.endMs = conflict.endMs;
      if (getRiskScore(conflict.severity) > getRiskScore(previous.severity)) {
        previous.severity = conflict.severity;
      }
      continue;
    }
    merged.push({ ...conflict });
  }

  return merged;
}

function getConflictSeverity(
  active: Map<string, { scheduleName: string; count: number }>
): ScheduleVisualizationRisk {
  if (Array.from(active.values()).some((entry) => entry.count > 1)) {
    return 'high';
  }
  return active.size >= 3 ? 'high' : 'medium';
}

function getActiveOccurrenceCount(
  active: Map<string, { scheduleName: string; count: number }>
): number {
  let count = 0;
  for (const entry of active.values()) {
    count += entry.count;
  }
  return count;
}

function isPreviewLimited(schedule: AIRunnerScheduleDTO): boolean {
  const parsed = parseScheduleBuilder(schedule.cronExpression);
  return parsed.mode === 'advanced' || !schedule.nextRunTime;
}

function buildWorkspaceSummary(
  enabledCount: number,
  pausedCount: number,
  conflictCount: number,
  risk: ScheduleVisualizationRisk,
  uniqueProfileCount: number
): string {
  if (enabledCount === 0) {
    return pausedCount > 0
      ? 'All schedules in this workspace are paused right now.'
      : 'No active schedules in this workspace.';
  }

  if (risk === 'high') {
    return `${conflictCount} overlap window${conflictCount === 1 ? '' : 's'} predicted here across ${uniqueProfileCount} profile${uniqueProfileCount === 1 ? '' : 's'}.`;
  }

  if (risk === 'medium') {
    return `Multiple enabled schedules share this workspace across ${uniqueProfileCount} profile${uniqueProfileCount === 1 ? '' : 's'}, but no overlap is predicted in the next 24 hours.`;
  }

  return 'Only one enabled schedule is active here, so collision risk stays low.';
}

function buildProfileSummary(
  enabledCount: number,
  pausedCount: number,
  conflictCount: number,
  risk: ScheduleVisualizationRisk,
  uniqueWorkspaceCount: number
): string {
  if (enabledCount === 0) {
    return pausedCount > 0
      ? 'Every schedule on this profile is paused right now.'
      : 'No active schedules on this profile.';
  }

  if (risk === 'high') {
    return `${conflictCount} overlap window${conflictCount === 1 ? '' : 's'} predicted while this profile works across ${uniqueWorkspaceCount} workspace${uniqueWorkspaceCount === 1 ? '' : 's'}.`;
  }

  if (risk === 'medium') {
    return `Multiple enabled schedules share this profile across ${uniqueWorkspaceCount} workspace${uniqueWorkspaceCount === 1 ? '' : 's'}, but no overlap is predicted in the next 24 hours.`;
  }

  return 'Only one enabled schedule is attached to this profile, so runtime pressure stays light.';
}

function groupVisualizedSchedules(
  schedules: VisualizedSchedule[],
  grouping: 'workspace' | 'profile'
): Map<string, VisualizedSchedule[]> {
  const grouped = new Map<string, VisualizedSchedule[]>();

  for (const schedule of schedules) {
    const key = grouping === 'workspace' ? schedule.workspaceKey : schedule.profileKey;
    const list = grouped.get(key) ?? [];
    list.push(schedule);
    grouped.set(key, list);
  }

  return grouped;
}

function mapScheduleToConflictDescriptors(
  schedule: VisualizedSchedule
): ScheduleOccurrenceDescriptor[] {
  return schedule.occurrences.map((occurrence) => ({
    scheduleId: schedule.schedule._id,
    scheduleName: schedule.schedule.name,
    startMs: occurrence.startMs,
    endMs: occurrence.endMs,
    workspaceKey: schedule.workspaceKey,
    profileKey: schedule.profileKey,
  }));
}

function getNextRunTime(schedules: VisualizedSchedule[]): string | undefined {
  return schedules
    .filter((schedule) => schedule.schedule.enabled && schedule.schedule.nextRunTime)
    .sort((left, right) => {
      return (
        new Date(left.schedule.nextRunTime ?? 0).getTime() -
        new Date(right.schedule.nextRunTime ?? 0).getTime()
      );
    })[0]?.schedule.nextRunTime;
}

function compareGroupsByRisk(
  left: BaseGroupVisualization & { workspaceLabel?: string; profileLabel?: string },
  right: BaseGroupVisualization & { workspaceLabel?: string; profileLabel?: string }
): number {
  const riskScore = getRiskScore(right.risk) - getRiskScore(left.risk);
  if (riskScore !== 0) return riskScore;
  if (right.conflictCount !== left.conflictCount) {
    return right.conflictCount - left.conflictCount;
  }
  if (right.enabledCount !== left.enabledCount) {
    return right.enabledCount - left.enabledCount;
  }

  const leftLabel = left.workspaceLabel ?? left.profileLabel ?? '';
  const rightLabel = right.workspaceLabel ?? right.profileLabel ?? '';
  return leftLabel.localeCompare(rightLabel);
}

function compareVisualizedSchedules(left: VisualizedSchedule, right: VisualizedSchedule): number {
  if (left.schedule.enabled !== right.schedule.enabled) {
    return left.schedule.enabled ? -1 : 1;
  }
  if (left.schedule.nextRunTime && right.schedule.nextRunTime) {
    return (
      new Date(left.schedule.nextRunTime).getTime() - new Date(right.schedule.nextRunTime).getTime()
    );
  }
  if (left.schedule.nextRunTime) return -1;
  if (right.schedule.nextRunTime) return 1;
  return left.schedule.name.localeCompare(right.schedule.name);
}

function getProfileLabel(
  profileKey: string,
  profileMap?: Record<string, Pick<AIRunnerProfileDTO, 'name'>>
): string {
  if (profileKey === UNASSIGNED_PROFILE_KEY) {
    return UNASSIGNED_PROFILE_LABEL;
  }

  return profileMap?.[profileKey]?.name ?? profileKey;
}

function getRiskScore(risk: ScheduleVisualizationRisk): number {
  if (risk === 'high') return 3;
  if (risk === 'medium') return 2;
  return 1;
}

function normalizeWorkspaceKey(workspace: string): string {
  const trimmed = workspace.trim();
  return trimmed.length > 0 ? trimmed : UNASSIGNED_WORKSPACE_KEY;
}

function normalizeProfileKey(profileId: string): string {
  const trimmed = profileId.trim();
  return trimmed.length > 0 ? trimmed : UNASSIGNED_PROFILE_KEY;
}
