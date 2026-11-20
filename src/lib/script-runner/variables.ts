import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createLogger } from '@/lib/logger';
import { ScriptRunnerSettings, ScriptRunnerVariable } from '@/models/ScriptRunner';
import type { ScriptEnvironmentVariable } from '@/modules/script-runner/types';
import { combineLaunchEnvironment, openVariable } from './environment';
import { runnerHost } from './store';

const log = createLogger('script-runner:variables');

export class LinkedVariableError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

export async function readLinkedEnvironment(
  ids: string[] = []
): Promise<ScriptEnvironmentVariable[]> {
  if (!ids.length) return [];
  const variables = await ScriptRunnerVariable.find({ host: runnerHost, _id: { $in: ids } })
    .select('+valueSeal')
    .sort({ key: 1 })
    .lean();
  if (variables.length !== ids.length) {
    throw new LinkedVariableError('A linked environment variable is unavailable.', 422);
  }
  return variables.map(({ key, valueSeal }) => ({ key, value: openVariable(valueSeal) }));
}

export async function validateLinkedEnvironment(
  ids: string[] | undefined,
  env: ScriptEnvironmentVariable[]
) {
  if (ids?.length) combineLaunchEnvironment(await readLinkedEnvironment(ids), env);
}

export async function withLinkMutation<T>(action: () => Promise<T>): Promise<T> {
  const host = { _id: runnerHost };
  const id = randomUUID();
  const deadline = Date.now() + 2000;

  await ScriptRunnerSettings.updateOne(host, { $setOnInsert: host }, { upsert: true });
  // Serialize writes that change references, including on hosts with a standalone MongoDB.
  do {
    const now = new Date();
    const lock = await ScriptRunnerSettings.updateOne(
      { ...host, $or: [{ linkMutationUntil: null }, { linkMutationUntil: { $lte: now } }] },
      { $set: { linkMutationId: id, linkMutationUntil: new Date(now.getTime() + 30_000) } }
    );
    if (lock.matchedCount) {
      try {
        return await action();
      } finally {
        await ScriptRunnerSettings.updateOne(
          { ...host, linkMutationId: id },
          { $unset: { linkMutationId: 1, linkMutationUntil: 1 } }
        ).catch((error: unknown) => log.warn('Could not release the script link lock', error));
      }
    }
    await delay(35);
  } while (Date.now() < deadline);
  throw new LinkedVariableError('Another script or variable is being updated. Try again.', 409);
}
