import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { createLogger } from '@/lib/logger';
import type { CommandRunRequest, CommandRunner } from './deploy';
import {
  setAppOperationSpawnPending,
  trackAppOperationProcess,
  untrackAppOperationProcesses,
} from './repositories/operation-repository';

const log = createLogger('apps:process-tracking');

export interface OperationCommandTracking {
  operationId: string;
  workerId: string;
  leaseGeneration: number;
}

const trackingStorage = new AsyncLocalStorage<OperationCommandTracking>();

export function runWithOperationCommandTracking<T>(
  tracking: OperationCommandTracking,
  callback: () => Promise<T>
): Promise<T> {
  return trackingStorage.run(tracking, callback);
}

async function markSpawnPending(tracking: OperationCommandTracking, pending: boolean) {
  try {
    await setAppOperationSpawnPending({ ...tracking, pending });
  } catch (error: unknown) {
    log.warn('Failed to update app operation spawn-pending flag', {
      operationId: tracking.operationId,
      pending,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function trackSpawn(
  tracking: OperationCommandTracking,
  token: string,
  command: string,
  spawn: { pid: number; startTime: string | null }
) {
  try {
    await trackAppOperationProcess({
      ...tracking,
      process: { token, pid: spawn.pid, startTime: spawn.startTime ?? '', command },
    });
  } catch (error: unknown) {
    log.warn('Failed to track app operation process', {
      operationId: tracking.operationId,
      pid: spawn.pid,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function untrackSpawn(tracking: OperationCommandTracking, token: string) {
  try {
    await untrackAppOperationProcesses({ ...tracking, token });
  } catch (error: unknown) {
    log.warn('Failed to untrack app operation process', {
      operationId: tracking.operationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function wrapCommandRunnerWithProcessTracking(runner: CommandRunner): CommandRunner {
  return async (request: CommandRunRequest) => {
    const tracking = trackingStorage.getStore();
    if (!tracking) return runner(request);

    const token = randomUUID();
    await markSpawnPending(tracking, true);
    try {
      return await runner({
        ...request,
        onSpawn: async (spawn) => {
          await trackSpawn(tracking, token, request.command, spawn);
          await markSpawnPending(tracking, false);
        },
      });
    } finally {
      await untrackSpawn(tracking, token);
      await markSpawnPending(tracking, false);
    }
  };
}
