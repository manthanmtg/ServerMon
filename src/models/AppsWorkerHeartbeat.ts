import mongoose, { Document, Model, Schema } from 'mongoose';

export type AppsWorkerHeartbeatStatus = 'starting' | 'running' | 'draining' | 'stopped' | 'failed';

export interface IAppsWorkerHeartbeat extends Document {
  _id: mongoose.Types.ObjectId;
  workerId: string;
  status: AppsWorkerHeartbeatStatus;
  hostname: string;
  pid: number;
  version?: string;
  currentOperationId?: string;
  leaseGeneration?: number;
  startedAt: Date;
  lastSeenAt: Date;
  stoppedAt?: Date;
  error?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const AppsWorkerHeartbeatSchema = new Schema<IAppsWorkerHeartbeat>(
  {
    workerId: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['starting', 'running', 'draining', 'stopped', 'failed'],
      required: true,
      default: 'starting',
    },
    hostname: { type: String, required: true, trim: true },
    pid: { type: Number, required: true },
    version: { type: String, trim: true },
    currentOperationId: { type: String, trim: true },
    leaseGeneration: { type: Number, min: 0 },
    startedAt: { type: Date, required: true, default: Date.now },
    lastSeenAt: { type: Date, required: true, default: Date.now },
    stoppedAt: { type: Date },
    error: { type: String },
  },
  { timestamps: true }
);

AppsWorkerHeartbeatSchema.index({ workerId: 1 }, { unique: true });
AppsWorkerHeartbeatSchema.index({ lastSeenAt: -1 });

const AppsWorkerHeartbeat: Model<IAppsWorkerHeartbeat> =
  (mongoose.models.AppsWorkerHeartbeat as Model<IAppsWorkerHeartbeat>) ||
  mongoose.model<IAppsWorkerHeartbeat>('AppsWorkerHeartbeat', AppsWorkerHeartbeatSchema);

export default AppsWorkerHeartbeat;
