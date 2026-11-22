import type { FleetLogService } from './enums';
import { retentionUntilFromDays } from './logRetention';

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

export interface AuditLogModel {
  create(doc: Record<string, unknown>): Promise<unknown>;
}

const DEFAULT_RETENTION_DAYS = 365;

export async function recordAudit(
  FleetLogEvent: AuditLogModel,
  input: RecordAuditInput
): Promise<void> {
  const retentionDays = input.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const retentionUntil = retentionUntilFromDays(retentionDays);

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
