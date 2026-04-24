import type { Model } from 'mongoose';
import type { FleetLogService } from './enums';

export interface RecordAuditInput {
  action: string;
  actorUserId?: string;
  nodeId?: string;
  routeId?: string;
  service?: FleetLogService;
  message?: string;
  metadata?: Record<string, unknown>;
  correlationId?: string;
  retentionDays?: number;
}

const DEFAULT_RETENTION_DAYS = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function recordAudit(
  FleetLogEvent: Model<unknown>,
  input: RecordAuditInput
): Promise<void> {
  const retentionDays = input.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const retentionUntil = new Date(Date.now() + retentionDays * MS_PER_DAY);

  await FleetLogEvent.create({
    audit: true,
    level: 'audit',
    service: input.service ?? 'servermon',
    eventType: input.action,
    message: input.message ?? input.action,
    metadata: input.metadata,
    correlationId: input.correlationId,
    nodeId: input.nodeId,
    routeId: input.routeId,
    actorUserId: input.actorUserId,
    retentionUntil,
  });
}
