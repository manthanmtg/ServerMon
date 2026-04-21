import type { AIRunnerScheduleDTO } from '../types';
import { parseScheduleBuilder } from './utils';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const DEFAULT_HORIZON_HOURS = 24;
const MAX_OCCURRENCES_PER_SCHEDULE = 1_500;
const UNASSIGNED_WORKSPACE_KEY = '__unassigned_workspace__';
const UNASSIGNED_WORKSPACE_LABEL = 'No workspace assigned';

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
  occurrences: ScheduleTimelineOccurrence[];
  timelineWindows: ScheduleTimelineWindow[];
  previewLimited: boolean;
}

export interface WorkspaceConflictWindow {
  startMs: number;
  endMs: number;
  scheduleIds: string[];
  scheduleNames: string[];
  severity: ScheduleVisualizationRisk;
  kind: 'self-overlap' | 'multi-schedule';
}

export interface WorkspaceVisualization {
  workspaceKey: string;
  workspaceLabel: string;
  schedules: VisualizedSchedule[];
  enabledCount: number;
  pausedCount: number;
  conflictCount: number;
  risk: ScheduleVisualizationRisk;
  conflicts: WorkspaceConflictWindow[];
  summary: string;
}

export interface ScheduleVisualizationModel {
  workspaceCount: number;
  enabledScheduleCount: number;
  pausedScheduleCount: number;
  highRiskWorkspaceCount: number;
  limitedPreviewCount: number;
  totalConflictCount: number;
  horizonStartMs: number;
  horizonEndMs: number;
  workspaces: WorkspaceVisualization[];
}

export function buildScheduleVisualizationModel(
  schedules: AIRunnerScheduleDTO[],
  now = Date.now(),
  horizonHours = DEFAULT_HORIZON_HOURS
): ScheduleVisualizationModel {
  const horizonStartMs = now;
  const horizonEndMs = now + horizonHours * HOUR_MS;
  const grouped = new Map<string, AIRunnerScheduleDTO[]>();

  for (const schedule of schedules) {
    const key = normalizeWorkspaceKey(schedule.workingDirectory);
    const list = grouped.get(key) ?? [];
    list.push(schedule);
    grouped.set(key, list);
  }

  const workspaces = Array.from(grouped.entries())
    .map(([workspaceKey, workspaceSchedules]) =>
      buildWorkspaceVisualization(workspaceKey, workspaceSchedules, horizonStartMs, horizonEndMs)
    )
    .sort((left, right) => {
      const riskScore = getRiskScore(right.risk) - getRiskScore(left.risk);
      if (riskScore !== 0) return riskScore;
      if (right.conflictCount !== left.conflictCount)
        return right.conflictCount - left.conflictCount;
      if (right.enabledCount !== left.enabledCount) return right.enabledCount - left.enabledCount;
      return left.workspaceLabel.localeCompare(right.workspaceLabel);
    });

  return {
    workspaceCount: workspaces.length,
    enabledScheduleCount: schedules.filter((schedule) => schedule.enabled).length,
    pausedScheduleCount: schedules.filter((schedule) => !schedule.enabled).length,
    highRiskWorkspaceCount: workspaces.filter((workspace) => workspace.risk === 'high').length,
    limitedPreviewCount: workspaces
      .flatMap((workspace) => workspace.schedules)
      .filter((schedule) => schedule.previewLimited).length,
    totalConflictCount: workspaces.reduce((total, workspace) => total + workspace.conflictCount, 0),
    horizonStartMs,
    horizonEndMs,
    workspaces,
  };
}

function buildWorkspaceVisualization(
  workspaceKey: string,
  schedules: AIRunnerScheduleDTO[],
  horizonStartMs: number,
  horizonEndMs: number
): WorkspaceVisualization {
  const visualizedSchedules = schedules
    .map((schedule) => visualizeSchedule(schedule, horizonStartMs, horizonEndMs))
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
    });

  const enabledCount = schedules.filter((schedule) => schedule.enabled).length;
  const pausedCount = schedules.length - enabledCount;
  const conflicts = buildWorkspaceConflicts(
    visualizedSchedules.flatMap((entry) =>
      entry.occurrences.map((occurrence) => ({
        scheduleId: entry.schedule._id,
        scheduleName: entry.schedule.name,
        startMs: occurrence.startMs,
        endMs: occurrence.endMs,
      }))
    )
  );
  const risk = conflicts.length > 0 ? 'high' : enabledCount > 1 ? 'medium' : 'low';

  return {
    workspaceKey,
    workspaceLabel:
      workspaceKey === UNASSIGNED_WORKSPACE_KEY ? UNASSIGNED_WORKSPACE_LABEL : workspaceKey,
    schedules: visualizedSchedules,
    enabledCount,
    pausedCount,
    conflictCount: conflicts.length,
    risk,
    conflicts,
    summary: buildWorkspaceSummary(enabledCount, pausedCount, conflicts.length, risk),
  };
}

function visualizeSchedule(
  schedule: AIRunnerScheduleDTO,
  horizonStartMs: number,
  horizonEndMs: number
): VisualizedSchedule {
  const occurrences = buildOccurrences(schedule, horizonStartMs, horizonEndMs);
  return {
    schedule,
    occurrences,
    timelineWindows: mergeTimelineWindows(occurrences, horizonStartMs, horizonEndMs),
    previewLimited: schedule.enabled && isPreviewLimited(schedule),
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

function buildWorkspaceConflicts(
  occurrences: Array<{ scheduleId: string; scheduleName: string; startMs: number; endMs: number }>
): WorkspaceConflictWindow[] {
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

  const conflicts: WorkspaceConflictWindow[] = [];
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

function mergeConflictWindows(conflicts: WorkspaceConflictWindow[]): WorkspaceConflictWindow[] {
  const merged: WorkspaceConflictWindow[] = [];

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
  risk: ScheduleVisualizationRisk
): string {
  if (enabledCount === 0) {
    return pausedCount > 0
      ? 'All schedules in this workspace are paused right now.'
      : 'No active schedules in this workspace.';
  }

  if (risk === 'high') {
    return `${conflictCount} overlap window${conflictCount === 1 ? '' : 's'} predicted in the next 24 hours.`;
  }

  if (risk === 'medium') {
    return 'Multiple enabled schedules share this workspace, but no overlap is predicted in the next 24 hours.';
  }

  return 'Only one enabled schedule is active here, so collision risk stays low.';
}

function normalizeWorkspaceKey(workspace: string): string {
  const trimmed = workspace.trim();
  return trimmed.length > 0 ? trimmed : UNASSIGNED_WORKSPACE_KEY;
}

function getRiskScore(risk: ScheduleVisualizationRisk): number {
  if (risk === 'high') return 3;
  if (risk === 'medium') return 2;
  return 1;
}
