import { nextScheduleTime, scheduleResponse } from '@/lib/script-runner/schedules';
import { runIdInput, scheduleInput } from '@/lib/script-runner/schemas';
import { findScript } from '@/lib/script-runner/store';
import { authorized, body, data, failure, type ById } from '../../_shared';

export const dynamic = 'force-dynamic';

export function PUT(request: Request, { params }: ById) {
  return authorized(request, async ({ username }) => {
    const id = runIdInput.parse((await params).id);
    const input = await body(request, scheduleInput);
    const updated = await findScript(id)
      .findOneAndUpdate(
        {
          $or: [
            { 'schedule.intervalMinutes': { $ne: input.intervalMinutes } },
            { 'schedule.enabled': { $ne: input.enabled } },
          ],
        },
        {
          $set: {
            'schedule.intervalMinutes': input.intervalMinutes,
            'schedule.enabled': input.enabled,
            'schedule.requestedBy': username,
            ...(input.enabled && {
              'schedule.nextRunAt': nextScheduleTime(input.intervalMinutes, new Date()),
            }),
          },
          $unset: {
            'schedule.pendingRunId': 1,
            'schedule.pendingScheduledFor': 1,
            'schedule.lastAttemptAt': 1,
            'schedule.lastOutcome': 1,
            'schedule.lastError': 1,
            ...(!input.enabled && { 'schedule.nextRunAt': 1 }),
          },
        },
        { returnDocument: 'after', timestamps: false }
      )
      .select('schedule')
      .lean();
    const schedule =
      updated?.schedule ?? (await findScript(id).select('schedule').lean())?.schedule;
    return schedule ? data(scheduleResponse(id, schedule)) : failure('Script not found.', 404);
  });
}

export function DELETE(request: Request, { params }: ById) {
  return authorized(request, async () => {
    const id = runIdInput.parse((await params).id);
    await findScript(id).updateOne({}, { $unset: { schedule: 1 } }, { timestamps: false });
    return data({ deleted: true });
  });
}
