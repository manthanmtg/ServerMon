import { retentionInput } from '@/lib/script-runner/schemas';
import { runnerHost } from '@/lib/script-runner/store';
import { ScriptRunnerSettings } from '@/models/ScriptRunner';
import { authorized, body, data } from '../_shared';

export const dynamic = 'force-dynamic';

export function PATCH(request: Request) {
  return authorized(request, async () => {
    const settings = await body(request, retentionInput);
    await ScriptRunnerSettings.updateOne({ _id: runnerHost }, { $set: settings }, { upsert: true });
    return data(settings);
  });
}
