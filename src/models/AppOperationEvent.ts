import mongoose, { Document, Model, Schema } from 'mongoose';
import type { AppV2OperationPhase, AppV2OperationStatus } from '@/modules/apps/types';

export type AppOperationEventType = 'created' | 'progress' | 'log' | 'warning' | 'error' | 'status';

export interface IAppOperationEvent extends Document {
  _id: mongoose.Types.ObjectId;
  operationId: string;
  appId: mongoose.Types.ObjectId;
  sequence: number;
  type: AppOperationEventType;
  status?: AppV2OperationStatus;
  phase?: AppV2OperationPhase;
  message: string;
  details?: Record<string, unknown>;
  createdAt: Date;
}

const AppOperationEventSchema = new Schema<IAppOperationEvent>(
  {
    operationId: { type: String, required: true, trim: true },
    appId: { type: Schema.Types.ObjectId, ref: 'ManagedApp', required: true },
    sequence: { type: Number, required: true, min: 1 },
    type: {
      type: String,
      enum: ['created', 'progress', 'log', 'warning', 'error', 'status'],
      required: true,
    },
    status: {
      type: String,
      enum: [
        'queued',
        'running',
        'cancel_requested',
        'succeeded',
        'failed',
        'cancelled',
        'unchanged',
      ],
    },
    phase: {
      type: String,
      enum: [
        'queued',
        'claiming',
        'preflight',
        'source',
        'install',
        'build',
        'stage',
        'activate',
        'health',
        'routing',
        'tls',
        'finalize',
        'cleanup',
        'terminal',
      ],
    },
    message: { type: String, required: true },
    details: { type: Schema.Types.Mixed },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false }
);

AppOperationEventSchema.index({ operationId: 1, sequence: 1 }, { unique: true });
AppOperationEventSchema.index({ operationId: 1, createdAt: 1 });
AppOperationEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

const AppOperationEvent: Model<IAppOperationEvent> =
  (mongoose.models.AppOperationEvent as Model<IAppOperationEvent>) ||
  mongoose.model<IAppOperationEvent>('AppOperationEvent', AppOperationEventSchema);

export default AppOperationEvent;
