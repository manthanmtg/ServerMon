import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import {
  ScriptRunnerEnvGroup,
  ScriptRunnerScript,
  ScriptRunnerSettings,
  ScriptRunnerVariable,
} from '@/models/ScriptRunner';
import type {
  EnvironmentLinks,
  SavedEnvGroup,
  ScriptEnvironmentVariable,
} from '@/modules/script-runner/types';
import { combineLaunchEnvironment, openEnvironment, openVariable } from './environment';
import { envGroupResponse, findEnvGroup, runnerHost } from './store';

const log = createLogger('script-runner:variables');

export class LinkedVariableError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

async function readVariables(ids: string[]) {
  if (!ids.length) return [];
  const variables = await ScriptRunnerVariable.find({ host: runnerHost, _id: { $in: ids } })
    .select('+valueSeal')
    .sort({ key: 1 })
    .lean();
  if (variables.length !== ids.length) {
    throw new LinkedVariableError('A linked environment variable is unavailable.', 422);
  }
  return variables;
}

async function readGroupMembers(ids: string[]) {
  if (!ids.length) return new Map<string, string[]>();
  const groups = await ScriptRunnerEnvGroup.find({ host: runnerHost, _id: { $in: ids } })
    .select('variableIds')
    .lean();
  if (groups.length !== ids.length) {
    throw new LinkedVariableError('A linked environment variable group is unavailable.', 422);
  }
  return new Map(groups.map(({ _id, variableIds }) => [_id, variableIds]));
}

function linkedVariableIds(links: EnvironmentLinks, members: Map<string, string[]>) {
  return [
    ...new Set([
      ...(links.envVarIds ?? []),
      ...(links.envGroupIds ?? []).flatMap((id) => members.get(id) ?? []),
    ]),
  ];
}

export async function readLinkedEnvironment(links: EnvironmentLinks) {
  const members = await readGroupMembers(links.envGroupIds ?? []);
  const variables = await readVariables(linkedVariableIds(links, members));
  return variables.map(({ key, valueSeal }) => ({ key, value: openVariable(valueSeal) }));
}

export async function validateLinkedEnvironment(
  links: EnvironmentLinks,
  env: ScriptEnvironmentVariable[]
) {
  if (links.envVarIds?.length || links.envGroupIds?.length) {
    combineLaunchEnvironment(await readLinkedEnvironment(links), env);
  }
}

async function validateGroupMembers(variableIds: string[], groupId?: string) {
  const scripts = groupId
    ? await ScriptRunnerScript.find({ host: runnerHost, envGroupIds: groupId })
        .select('title envVarIds envGroupIds +environmentSeal')
        .lean()
    : [];
  const otherGroups = [...new Set(scripts.flatMap((script) => script.envGroupIds ?? []))].filter(
    (id) => id !== groupId
  );
  const members = await readGroupMembers(otherGroups);
  if (groupId) members.set(groupId, variableIds);
  const links = scripts.map((script) => ({ script, ids: linkedVariableIds(script, members) }));
  const variables = await readVariables([
    ...new Set([...variableIds, ...links.flatMap(({ ids }) => ids)]),
  ]);
  if (!links.length) return;
  const environment = new Map(
    variables.map(({ _id, key, valueSeal }) => [_id, { key, value: openVariable(valueSeal) }])
  );
  for (const { script, ids } of links) {
    try {
      const linked = ids.map((id) => environment.get(id)!);
      combineLaunchEnvironment(linked, openEnvironment(script.environmentSeal));
    } catch (error) {
      if (!(error instanceof z.ZodError)) throw error;
      throw new LinkedVariableError(
        `The group change would exceed the environment limits for “${script.title}”.`,
        422
      );
    }
  }
}

export async function saveEnvGroup({ name, variableIds }: Omit<SavedEnvGroup, 'id'>, id?: string) {
  await ScriptRunnerEnvGroup.init();
  return withLinkMutation(async () => {
    const current = id ? await findEnvGroup(id).select('variableIds').lean() : null;
    if (id && !current) throw new LinkedVariableError('Variable group not found.', 404);
    if (
      !current ||
      variableIds.length !== current.variableIds.length ||
      variableIds.some((member) => !current.variableIds.includes(member))
    ) {
      await validateGroupMembers(variableIds, id);
    }
    const fields = { name, nameKey: name.toLowerCase(), variableIds };
    try {
      const group = id
        ? await findEnvGroup(id)
            .findOneAndUpdate({}, { $set: fields }, { returnDocument: 'after' })
            .lean()
        : await ScriptRunnerEnvGroup.create({ _id: randomUUID(), host: runnerHost, ...fields });
      if (!group) throw new LinkedVariableError('Variable group not found.', 404);
      return envGroupResponse(group);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
        throw new LinkedVariableError('A variable group with this name already exists.', 409);
      }
      throw error;
    }
  });
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
