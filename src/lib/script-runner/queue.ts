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
import { runRequestInput } from '@/lib/script-runner/schemas';
import {
  findRun,
  findScript,
  runnerDefaults,
  runnerHost,
  runnerSettings,
  storedDraft,
  workerOnline,
  workerCapabilities,
} from '@/lib/script-runner/store';

import type { z } from 'zod';

export class RunQueueError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

export async function enqueueRun(
  input: z.output<typeof runRequestInput>,
  requestedBy: string,
  scheduledFor?: Date
) {
  const { id = randomUUID(), scriptId } = input;
  const draft = 'source' in input ? input : undefined;
  const rerunOf = draft?.rerunOf;
  const existing = await findRun(id).lean();
  if (existing) return existing;

  const settings = await runnerSettings();
  if (!workerOnline(settings?.workerSeenAt)) {
    throw new RunQueueError('The Linux script worker is offline.', 503);
  }
  const [script, previousRun] = await Promise.all([
    scriptId ? findScript(scriptId).select('+source +environmentSeal').lean() : null,
    rerunOf ? findRun(rerunOf).select('+environmentSeal +linkedEnvironmentSeal').lean() : null,
  ]);
  const content = draft ?? script;
  if (!content || (scriptId && !script)) {
    throw new RunQueueError('The saved script no longer exists.', 404);
  }
  if (rerunOf && !previousRun) throw new RunQueueError('The original run no longer exists.', 404);

  const defaults = runnerDefaults(settings);
  const language = draft?.language ?? previousRun?.language ?? script?.language ?? 'bash';
  const timeoutSeconds =
    draft?.timeoutSeconds ??
    previousRun?.timeoutSeconds ??
    script?.timeoutSeconds ??
    defaults.defaultTimeoutSeconds;
  const cwd = draft?.cwd ?? previousRun?.cwd ?? script?.cwd ?? defaults.defaultWorkingDirectory;
  const ids = draft?.envVarIds ?? (previousRun ? [] : (script?.envVarIds ?? []));
  const linked = [
    ...openEnvironment(previousRun?.linkedEnvironmentSeal),
    ...(await readLinkedEnvironment(ids)),
  ];
  const editable =
    draft?.env ??
    openEnvironment(previousRun ? previousRun.environmentSeal : script?.environmentSeal);
  const combined = combineLaunchEnvironment(linked, editable);
  const environment = partitionRunEnvironment(combined.env, combined.linkedEnvKeys);
  const capabilities = workerCapabilities(settings);
  if (!capabilities.runtimes.includes(language)) {
    throw new RunQueueError('This runtime is unavailable on the Linux script worker.', 422);
  }
  if (combined.env.length && capabilities.protocol < 2) {
    throw new RunQueueError('Upgrade the Linux script worker to use environment variables.', 503);
  }
  if (environment.linked.length && settings?.workerLinkedEnvironmentId !== settings?.workerId) {
    throw new RunQueueError(
      'Upgrade the Linux script worker to use linked environment variables.',
      503
    );
  }

  try {
    if (!(await stat(cwd)).isDirectory()) {
      throw new RunQueueError('Choose an existing working directory on this server.', 422);
    }
  } catch (error) {
    if (error instanceof RunQueueError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EACCES' && code !== 'EPERM') {
      throw new RunQueueError('Choose an existing working directory on this server.', 422);
    }
    // The launcher validates paths that only the execution account can access.
  }

  try {
    const run = await ScriptRunnerRun.create({
      ...storedDraft({
        title: content.title,
        source: content.source,
        args: content.args,
        cwd,
        timeoutSeconds,
        language,
        env: environment.editable,
      }),
      linkedEnvironmentSeal: sealEnvironment(environment.linked),
      scriptId,
      requestedBy,
      scheduledFor,
      host: runnerHost,
      _id: id,
      // Earlier workers only claim 'queued' and cannot execute linked environments.
      status: environment.linked.length ? 'queued_linked' : 'queued',
      createdAt: new Date(),
    });
    return run;
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000))
      throw error;
    const run = await findRun(id).lean();
    if (!run) throw new RunQueueError('The run identifier is already in use.', 409);
    return run;
  }
}
