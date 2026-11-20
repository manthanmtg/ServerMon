import { scheduleResponse } from '@/lib/script-runner/schedules';
import { runnerHost } from '@/lib/script-runner/store';
import { ScriptRunnerScript } from '@/models/ScriptRunner';
import { authorized, data } from '../_shared';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return authorized(request, async () => {
    const scripts = await ScriptRunnerScript.find({ host: runnerHost, schedule: { $exists: true } })
      .select('schedule')
      .sort({ title: 1, _id: 1 })
      .lean();
    return data(
      scripts.flatMap(({ _id, schedule }) => (schedule ? [scheduleResponse(_id, schedule)] : []))
    );
  });
}
