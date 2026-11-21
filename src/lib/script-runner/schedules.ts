import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import { ScriptRunnerRun, ScriptRunnerScript, type ScheduleRecord } from '@/models/ScriptRunner';
import type { ScheduleTiming, ScriptSchedule } from '@/modules/script-runner/types';
import { nextCalendarRun } from './calendar';
import { EnvironmentKeyError } from './environment';
import { enqueueRun, RunQueueError } from './queue';
import { ACTIVE_STATUSES, findRun, findScript, runnerHost } from './store';
import { LinkedVariableError } from './variables';

const log = createLogger('script-runner:schedules');

function scheduleTiming(schedule: ScheduleRecord): ScheduleTiming {
  if (schedule.calendar) return { calendar: schedule.calendar };
  if (schedule.intervalMinutes !== undefined) return { intervalMinutes: schedule.intervalMinutes };
  throw new Error('Script schedule has no timing configuration.');
}

export function scheduleTimingFilter(timing: ScheduleTiming) {
  return 'calendar' in timing
    ? {
        'schedule.calendar.frequency': timing.calendar.frequency,
        'schedule.calendar.time': timing.calendar.time,
        'schedule.calendar.timeZone': timing.calendar.timeZone,
      }
    : {
        'schedule.intervalMinutes': timing.intervalMinutes,
        'schedule.calendar': { $exists: false },
      };
}

export function scheduleResponse(scriptId: string, schedule: ScheduleRecord): ScriptSchedule {
  return {
    scriptId,
    ...scheduleTiming(schedule),
    enabled: schedule.enabled,
    nextRunAt: schedule.nextRunAt?.toISOString(),
    lastAttemptAt: schedule.lastAttemptAt?.toISOString(),
    lastOutcome: schedule.lastOutcome,
    lastError: schedule.lastError,
  };
}

export function nextScheduleTime(timing: ScheduleTiming, now: Date, dueAt = now) {
  if ('calendar' in timing) return nextCalendarRun(timing.calendar, now);
  const interval = timing.intervalMinutes * 60_000;
  const elapsed = now.getTime() - dueAt.getTime();
  return new Date(dueAt.getTime() + (Math.floor(elapsed / interval) + 1) * interval);
}

async function dispatch(scriptId: string, schedule: ScheduleRecord, now: Date) {
  const { pendingRunId: id, pendingScheduledFor: scheduledFor } = schedule;
  if (!id || !scheduledFor) return;

  let outcome: 'queued' | 'skipped' | 'failed' = 'queued';
  let message: string | undefined;
  try {
    // A worker restart after insertion can resume the attempt using the same run ID.
    if (!(await findRun(id).select('_id').lean())) {
      const active = await ScriptRunnerRun.exists({
        host: runnerHost,
        scriptId,
        status: { $in: ACTIVE_STATUSES },
        scheduledFor: { $exists: true },
      });
      if (active) {
        outcome = 'skipped';
        message = 'The previous scheduled run is still active.';
      } else if (
        await findScript(scriptId).findOne({ 'schedule.pendingRunId': id }).select('_id').lean()
      ) {
        await enqueueRun({ id, scriptId }, schedule.requestedBy, scheduledFor);
      } else {
        return;
      }
    }
  } catch (error) {
    outcome = 'failed';
    if (
      error instanceof RunQueueError ||
      error instanceof LinkedVariableError ||
      error instanceof EnvironmentKeyError
    ) {
      message = error.message;
    } else if (error instanceof z.ZodError) {
      message = 'The saved launch configuration is invalid.';
    } else {
      log.warn('Could not dispatch a scheduled script', {
        scriptId,
        error: error instanceof Error ? error.name : 'UnknownError',
      });
      // Retry an unexpected failure with the same run ID until the next interval.
      if (schedule.nextRunAt && schedule.nextRunAt > now) return;
      message = 'The worker could not queue this run.';
    }
  }

  await findScript(scriptId).updateOne(
    { 'schedule.pendingRunId': id },
    {
      $set: { 'schedule.lastOutcome': outcome, ...(message && { 'schedule.lastError': message }) },
      $unset: { 'schedule.pendingRunId': 1, 'schedule.pendingScheduledFor': 1 },
    },
    { timestamps: false }
  );
}

export async function enqueueDueSchedules(now: Date, signal: AbortSignal) {
  const pending = await ScriptRunnerScript.find({
    host: runnerHost,
    'schedule.enabled': true,
    'schedule.lastOutcome': 'pending',
  })
    .select('schedule')
    .lean();

  for (const script of pending) {
    if (signal.aborted) return;
    if (script.schedule) await dispatch(script._id, script.schedule, now);
  }

  const due = await ScriptRunnerScript.find({
    host: runnerHost,
    'schedule.enabled': true,
    'schedule.nextRunAt': { $lte: now },
    'schedule.pendingRunId': null,
  })
    .sort({ 'schedule.nextRunAt': 1 })
    .limit(25)
    .select('schedule')
    .lean();

  for (const script of due) {
    if (signal.aborted) return;
    const schedule = script.schedule;
    if (!schedule?.nextRunAt) continue;
    const timing = scheduleTiming(schedule);
    const claimed = await findScript(script._id)
      .findOneAndUpdate(
        {
          'schedule.enabled': true,
          'schedule.nextRunAt': schedule.nextRunAt,
          ...scheduleTimingFilter(timing),
          'schedule.pendingRunId': null,
        },
        {
          $set: {
            'schedule.nextRunAt': nextScheduleTime(timing, now, schedule.nextRunAt),
            'schedule.lastAttemptAt': now,
            'schedule.lastOutcome': 'pending',
            'schedule.pendingRunId': randomUUID(),
            'schedule.pendingScheduledFor': schedule.nextRunAt,
          },
          $unset: { 'schedule.lastError': 1 },
        },
        { returnDocument: 'after', timestamps: false }
      )
      .select('schedule')
      .lean();
    if (claimed?.schedule) await dispatch(script._id, claimed.schedule, now);
  }
}
