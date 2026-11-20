import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { ScriptRunnerRun } from '@/models/ScriptRunner';
import {
  combineLaunchEnvironment,
  openEnvironment,
  sealEnvironment,
  partitionRunEnvironment,
} from '@/lib/script-runner/environment';
import { readLinkedEnvironment } from '@/lib/script-runner/variables';
import { launchInput } from '@/lib/script-runner/schemas';
import {
  findRun,
  findScript,
  runnerDefaults,
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
      rerunOf,
      envVarIds: requestedLinks,
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
    const [script, previousRun] = await Promise.all([
      scriptId ? findScript(scriptId).select('+environmentSeal').lean() : null,
      rerunOf ? findRun(rerunOf).select('+environmentSeal +linkedEnvironmentSeal').lean() : null,
    ]);
    if (scriptId && !script) throw new RequestError('The saved script no longer exists.', 404);
    if (rerunOf && !previousRun) throw new RequestError('The original run no longer exists.', 404);

    const defaults = runnerDefaults(settings);
    const language = requestedLanguage ?? previousRun?.language ?? script?.language ?? 'bash';
    const timeoutSeconds =
      draft.timeoutSeconds ??
      previousRun?.timeoutSeconds ??
      script?.timeoutSeconds ??
      defaults.defaultTimeoutSeconds;
    const cwd = draft.cwd ?? previousRun?.cwd ?? script?.cwd ?? defaults.defaultWorkingDirectory;
    const ids = requestedLinks ?? (previousRun ? [] : (script?.envVarIds ?? []));
    const linked = [
      ...openEnvironment(previousRun?.linkedEnvironmentSeal),
      ...(await readLinkedEnvironment(ids)),
    ];
    const editable =
      requestedEnv ??
      openEnvironment(previousRun ? previousRun.environmentSeal : script?.environmentSeal);
    const combined = combineLaunchEnvironment(linked, editable);
    const environment = partitionRunEnvironment(combined.env, combined.linkedEnvKeys);
    const capabilities = workerCapabilities(settings);
    if (!capabilities.runtimes.includes(language)) {
      throw new RequestError('This runtime is unavailable on the Linux script worker.', 422);
    }
    if (combined.env.length && capabilities.protocol < 2) {
      throw new RequestError('Upgrade the Linux script worker to use environment variables.', 503);
    }
    if (environment.linked.length && settings?.workerLinkedEnvironmentId !== settings?.workerId) {
      throw new RequestError(
        'Upgrade the Linux script worker to use linked environment variables.',
        503
      );
    }

    try {
      if (!(await stat(cwd)).isDirectory()) {
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
        ...storedDraft({
          title: draft.title,
          source: draft.source,
          args: draft.args,
          cwd,
          timeoutSeconds,
          language,
          env: environment.editable,
        }),
        linkedEnvironmentSeal: sealEnvironment(environment.linked),
        scriptId,
        requestedBy: actor.username,
        host: runnerHost,
        _id: id,
        // Earlier workers only claim 'queued' and cannot execute linked environments.
        status: environment.linked.length ? 'queued_linked' : 'queued',
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
