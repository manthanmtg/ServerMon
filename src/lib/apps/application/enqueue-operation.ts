import { randomUUID } from 'crypto';
import connectDB from '@/lib/db';
import { createLogger } from '@/lib/logger';
import ManagedApp from '@/models/ManagedApp';
import type {
  AppCommands,
  AppExecutionEngine,
  AppOperationType,
  AppSourceType,
  AppTemplateId,
  EnqueuedAppOperationResponse,
} from '@/modules/apps/types';
import {
  createAppOperationRecord,
  findAppOperationByIdempotencyKey,
} from '../repositories/operation-repository';
import { getAppsWorkerAvailability } from '../repositories/worker-heartbeat-repository';

const log = createLogger('apps:enqueue-operation');

export const APPS_WORKER_UNAVAILABLE_MESSAGE =
  'Apps deployment worker is unavailable; retry after the service recovers';

export class AppsWorkerUnavailableError extends Error {
  constructor(readonly reason: 'missing' | 'stale' | 'not_running') {
    super(APPS_WORKER_UNAVAILABLE_MESSAGE);
    this.name = 'AppsWorkerUnavailableError';
  }
}

interface RequestedBy {
  userId?: string;
  username?: string;
  role?: string;
}

interface EnqueueAppOperationInput {
  appId: string;
  type: AppOperationType;
  idempotencyKey?: string;
  targetReleaseId?: string;
  requestedBy?: RequestedBy;
  operationIdFactory?: () => string;
}

interface ManagedAppQueueRecord {
  _id: { toString: () => string } | string;
  name: string;
  slug: string;
  templateId: AppTemplateId;
  sourceType?: AppSourceType;
  sourcePath?: string;
  gitUrl?: string;
  gitBranch?: string;
  domain: string;
  port: number;
  commands: AppCommands;
  healthCheckPath: string;
  tlsEnabled: boolean;
  configVersion?: number;
  executionEngine?: AppExecutionEngine;
  currentReleaseId?: string;
  activeReleaseId?: string;
}

function operationId(): string {
  return `op_${randomUUID()}`;
}

function titleForOperation(type: AppOperationType): string {
  if (type === 'deploy') return 'Manual deploy';
  if (type === 'update') return 'Manual update';
  if (type === 'rollback') return 'Rollback';
  return 'Delete app';
}

function operationLinks(operationIdValue: string): EnqueuedAppOperationResponse['links'] {
  return {
    self: `/api/modules/apps/operations/${operationIdValue}`,
    events: `/api/modules/apps/operations/${operationIdValue}/events`,
    cancel: `/api/modules/apps/operations/${operationIdValue}/cancel`,
  };
}

function snapshotAppConfig(app: ManagedAppQueueRecord): Record<string, unknown> {
  return {
    name: app.name,
    slug: app.slug,
    templateId: app.templateId,
    sourceType: app.sourceType ?? 'local',
    sourcePath: app.sourcePath,
    gitUrl: app.gitUrl,
    gitBranch: app.gitBranch,
    domain: app.domain,
    port: app.port,
    commands: app.commands,
    healthCheckPath: app.healthCheckPath,
    tlsEnabled: app.tlsEnabled,
    configVersion: app.configVersion ?? 1,
    executionEngine: app.executionEngine ?? 'legacy',
    currentReleaseId: app.currentReleaseId,
    activeReleaseId: app.activeReleaseId,
  };
}

function validateOperationRequest(
  app: ManagedAppQueueRecord,
  input: EnqueueAppOperationInput
): void {
  if (input.type === 'update' && (app.sourceType ?? 'local') !== 'git') {
    throw new Error('Only git apps can be updated');
  }
  if (input.type === 'rollback' && !input.targetReleaseId) {
    throw new Error('Rollback target release is required');
  }
}

export async function enqueueAppOperation(
  input: EnqueueAppOperationInput
): Promise<EnqueuedAppOperationResponse> {
  await connectDB();

  if (input.idempotencyKey) {
    const existing = await findAppOperationByIdempotencyKey(input.appId, input.idempotencyKey);
    if (existing) {
      return {
        operation: existing,
        links: operationLinks(existing.id),
      };
    }
  }

  const app = (await ManagedApp.findById(input.appId).lean()) as ManagedAppQueueRecord | null;
  if (!app) throw new Error('App not found');
  validateOperationRequest(app, input);

  const worker = await getAppsWorkerAvailability();
  if (!worker.available) {
    log.warn('Rejecting app operation because the Apps worker is unavailable', {
      appId: input.appId,
      operationType: input.type,
      reason: worker.reason,
    });
    throw new AppsWorkerUnavailableError(worker.reason);
  }

  const created = await createAppOperationRecord({
    operationId: input.operationIdFactory?.() ?? operationId(),
    appId: app._id.toString(),
    appSlug: app.slug,
    type: input.type,
    title: titleForOperation(input.type),
    configSnapshot: snapshotAppConfig(app),
    requestedBy: input.requestedBy,
    idempotencyKey: input.idempotencyKey,
    targetReleaseId: input.targetReleaseId,
  });

  return {
    operation: created,
    links: operationLinks(created.id),
  };
}
