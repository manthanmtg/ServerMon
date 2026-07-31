import mongoose, { Document, Model, Schema } from 'mongoose';
import type {
  AppOperationType,
  AppV2OperationPhase,
  AppV2OperationStatus,
} from '@/modules/apps/types';

export interface IAppOperation extends Document {
  _id: mongoose.Types.ObjectId;
  operationId: string;
  appId: mongoose.Types.ObjectId;
  appSlug: string;
  type: AppOperationType;
  status: AppV2OperationStatus;
  active: boolean;
  phase: AppV2OperationPhase;
  title: string;
  requestedBy?: {
    userId?: string;
    username?: string;
    role?: string;
  };
  idempotencyKey?: string;
  targetReleaseId?: string;
  releaseId?: string;
  commitSha?: string;
  configSnapshot: Record<string, unknown>;
  lease?: {
    workerId?: string;
    generation: number;
    expiresAt?: Date;
    renewedAt?: Date;
  };
  attempts: number;
  maxAttempts: number;
  nextEventSequence: number;
  result?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
  queuedAt: Date;
  startedAt?: Date;
  deadlineAt?: Date;
  completedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const RequestedBySchema = new Schema(
  {
    userId: { type: String, trim: true },
    username: { type: String, trim: true },
    role: { type: String, trim: true },
  },
  { _id: false }
);

const LeaseSchema = new Schema(
  {
    workerId: { type: String, trim: true },
    generation: { type: Number, required: true, default: 0, min: 0 },
    expiresAt: { type: Date },
    renewedAt: { type: Date },
  },
  { _id: false }
);

const OperationErrorSchema = new Schema(
  {
    code: { type: String, required: true, trim: true },
    message: { type: String, required: true },
    retryable: { type: Boolean, required: true, default: false },
    details: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const AppOperationSchema = new Schema<IAppOperation>(
  {
    operationId: { type: String, required: true, trim: true },
    appId: { type: Schema.Types.ObjectId, ref: 'ManagedApp', required: true },
    appSlug: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['deploy', 'update', 'rollback', 'delete'],
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
      required: true,
      default: 'queued',
    },
    active: { type: Boolean, required: true, default: true },
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
      required: true,
      default: 'queued',
    },
    title: { type: String, required: true, trim: true },
    requestedBy: { type: RequestedBySchema },
    idempotencyKey: { type: String, trim: true },
    targetReleaseId: { type: String, trim: true },
    releaseId: { type: String, trim: true },
    commitSha: { type: String, trim: true },
    configSnapshot: { type: Schema.Types.Mixed, required: true, default: {} },
    lease: { type: LeaseSchema, default: () => ({ generation: 0 }) },
    attempts: { type: Number, required: true, default: 0, min: 0 },
    maxAttempts: { type: Number, required: true, default: 3, min: 1 },
    nextEventSequence: { type: Number, required: true, default: 0, min: 0 },
    result: { type: Schema.Types.Mixed },
    error: { type: OperationErrorSchema },
    queuedAt: { type: Date, required: true, default: Date.now },
    startedAt: { type: Date },
    deadlineAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

AppOperationSchema.index({ operationId: 1 }, { unique: true });
AppOperationSchema.index(
  { appId: 1, active: 1 },
  { unique: true, partialFilterExpression: { active: true } }
);
AppOperationSchema.index(
  { appId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);
AppOperationSchema.index({ status: 1, active: 1, createdAt: 1 });
AppOperationSchema.index({ 'lease.expiresAt': 1 });

const AppOperation: Model<IAppOperation> =
  (mongoose.models.AppOperation as Model<IAppOperation>) ||
  mongoose.model<IAppOperation>('AppOperation', AppOperationSchema);

export default AppOperation;
