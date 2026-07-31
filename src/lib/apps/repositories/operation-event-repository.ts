import AppOperation from '@/models/AppOperation';
import AppOperationEvent, { AppOperationEventType } from '@/models/AppOperationEvent';
import type {
  AppOperationEventDTO,
  AppV2OperationPhase,
  AppV2OperationStatus,
} from '@/modules/apps/types';
import { redactOperationDetails, redactOperationMessage } from '../domain/redaction';

interface AppendOperationEventInput {
  operationId: string;
  appId: string;
  type: AppOperationEventType;
  message: string;
  status?: AppV2OperationStatus;
  phase?: AppV2OperationPhase;
  details?: Record<string, unknown>;
}

interface ListOperationEventsOptions {
  afterSequence?: number;
  limit?: number;
}

interface SequenceResult {
  nextEventSequence: number;
}

interface PersistedEvent {
  operationId: string;
  appId: { toString: () => string } | string;
  sequence: number;
  type: AppOperationEventType;
  status?: AppV2OperationStatus;
  phase?: AppV2OperationPhase;
  message: string;
  details?: Record<string, unknown>;
  createdAt: Date;
}

function toEventDTO(event: PersistedEvent): AppOperationEventDTO {
  return {
    operationId: event.operationId,
    appId: event.appId.toString(),
    sequence: event.sequence,
    type: event.type,
    status: event.status,
    phase: event.phase,
    message: event.message,
    details: event.details,
    createdAt: event.createdAt.toISOString(),
  };
}

export async function appendAppOperationEvent(
  input: AppendOperationEventInput
): Promise<AppOperationEventDTO> {
  const sequenced = await AppOperation.findOneAndUpdate(
    { operationId: input.operationId },
    { $inc: { nextEventSequence: 1 } },
    { new: true, projection: { nextEventSequence: 1 }, lean: true }
  );
  const sequenceResult = sequenced as SequenceResult | null;
  if (!sequenceResult) throw new Error('App operation not found');

  const event = (await AppOperationEvent.create({
    operationId: input.operationId,
    appId: input.appId,
    sequence: sequenceResult.nextEventSequence,
    type: input.type,
    status: input.status,
    phase: input.phase,
    message: redactOperationMessage(input.message),
    details: redactOperationDetails(input.details),
  })) as PersistedEvent;

  return toEventDTO(event);
}

export async function listAppOperationEvents(
  operationId: string,
  { afterSequence = 0, limit = 100 }: ListOperationEventsOptions = {}
): Promise<AppOperationEventDTO[]> {
  const boundedLimit = Math.min(Math.max(limit, 1), 100);
  const events = (await AppOperationEvent.find({
    operationId,
    sequence: { $gt: afterSequence },
  })
    .sort({ sequence: 1 })
    .limit(boundedLimit)) as PersistedEvent[];

  return events.map((event) => toEventDTO(event));
}
