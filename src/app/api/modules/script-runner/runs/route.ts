import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { ScriptRunnerRun } from '@/models/ScriptRunner';
import { openEnvironment } from '@/lib/script-runner/environment';
import { launchInput } from '@/lib/script-runner/schemas';
import {
  findRun,
  findScript,
  runnerHost,
  runnerSettings,
  runResponse,
  storedDraft,
  workerOnline,
  workerCapabilities,
} from '@/lib/script-runner/store';
import { authorized, body, data, RequestError } from '../_shared';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return authorized(request, async (actor) => {
    const {
      id = randomUUID(),
      scriptId,
      language: requestedLanguage,
      env: requestedEnv,
      ...draft
    } = await body(request, launchInput);
    const existing = await findRun(id).lean();
    if (existing) return data(runResponse(existing), 202);

    const settings = await runnerSettings();
    if (!workerOnline(settings?.workerSeenAt)) {
      throw new RequestError('The Linux script worker is offline.', 503);
    }
    const script = scriptId
      ? await findScript(scriptId).select('language +environmentSeal').lean()
      : null;
    if (scriptId && !script) throw new RequestError('The saved script no longer exists.', 404);

    const language = requestedLanguage ?? script?.language ?? 'bash';
    const env = requestedEnv ?? openEnvironment(script?.environmentSeal);
    const capabilities = workerCapabilities(settings);
    if (!capabilities.runtimes.includes(language)) {
      throw new RequestError('This runtime is unavailable on the Linux script worker.', 422);
    }
    if (env.length && capabilities.protocol < 2) {
      throw new RequestError('Upgrade the Linux script worker to use environment variables.', 503);
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
      // The launcher validates paths that only the execution account can access.
    }

    try {
      const run = await ScriptRunnerRun.create({
        ...storedDraft({ ...draft, language, env }),
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
