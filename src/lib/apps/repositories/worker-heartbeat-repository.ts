import AppsWorkerHeartbeat, { AppsWorkerHeartbeatStatus } from '@/models/AppsWorkerHeartbeat';

interface UpsertAppsWorkerHeartbeatInput {
  workerId: string;
  status: AppsWorkerHeartbeatStatus;
  hostname: string;
  pid: number;
  version?: string;
  currentOperationId?: string;
  leaseGeneration?: number;
  now?: Date;
  error?: string;
}

export async function upsertAppsWorkerHeartbeat(
  input: UpsertAppsWorkerHeartbeatInput
): Promise<void> {
  const now = input.now ?? new Date();
  await AppsWorkerHeartbeat.findOneAndUpdate(
    { workerId: input.workerId },
    {
      $set: {
        status: input.status,
        hostname: input.hostname,
        pid: input.pid,
        version: input.version,
        currentOperationId: input.currentOperationId,
        leaseGeneration: input.leaseGeneration,
        lastSeenAt: now,
        error: input.error,
      },
      $setOnInsert: {
        startedAt: now,
      },
    },
    { upsert: true, new: true }
  );
}

export async function markAppsWorkerStopped(workerId: string, now = new Date()): Promise<void> {
  await AppsWorkerHeartbeat.findOneAndUpdate(
    { workerId },
    {
      $set: {
        status: 'stopped',
        lastSeenAt: now,
        stoppedAt: now,
      },
    }
  );
}
