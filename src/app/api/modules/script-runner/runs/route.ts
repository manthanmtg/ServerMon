import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { ScriptRunnerRun } from '@/models/ScriptRunner';
import { launchInput } from '@/lib/script-runner/schemas';
import {
  findRun,
  findScript,
  runnerHost,
  runnerSettings,
  runResponse,
  workerOnline,
} from '@/lib/script-runner/store';
import { authorized, body, data, RequestError } from '../_shared';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return authorized(request, async (actor) => {
    const { id = randomUUID(), scriptId, ...draft } = await body(request, launchInput);
    const existing = await findRun(id).lean();
    if (existing) return data(runResponse(existing), 202);

    const settings = await runnerSettings();
    if (!workerOnline(settings?.workerSeenAt)) {
      throw new RequestError('The Linux script worker is offline.', 503);
    }
    if (scriptId && !(await findScript(scriptId).select('_id').lean())) {
      throw new RequestError('The saved script no longer exists.', 404);
    }

    try {
      if (!(await stat(draft.cwd)).isDirectory()) {
        throw new RequestError('Choose an existing working directory on this server.', 422);
      }
    } catch (error) {
      if (error instanceof RequestError) throw error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EACCES' && code !== 'EPERM') {
        throw new RequestError('Choose an existing working directory on this server.', 422);
      }
      // The shell validates paths that only the execution account can access.
    }

    try {
      const run = await ScriptRunnerRun.create({
        ...draft,
        scriptId,
        requestedBy: actor.username,
        host: runnerHost,
        _id: id,
        status: 'queued',
        createdAt: new Date(),
      });
      return data(runResponse(run), 202);
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000))
        throw error;
      const run = await findRun(id).lean();
      if (!run) throw new RequestError('The run identifier is already in use.', 409);
      return data(runResponse(run), 202);
    }
  });
}
