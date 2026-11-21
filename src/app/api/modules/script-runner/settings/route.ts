import { defaultsPatchInput } from '@/lib/script-runner/schemas';
import { runnerDefaults, runnerHost } from '@/lib/script-runner/store';
import { ScriptRunnerSettings } from '@/models/ScriptRunner';
import { authorized, body, data } from '../_shared';

export const dynamic = 'force-dynamic';

export function PATCH(request: Request) {
  return authorized(request, async () => {
    const settings = await body(request, defaultsPatchInput);
    const updated = await ScriptRunnerSettings.findOneAndUpdate(
      { _id: runnerHost },
      { $set: settings },
      { upsert: true, returnDocument: 'after' }
    ).lean();
    return data(runnerDefaults(updated));
  });
}
