import mongoose, { Document, Model, Schema } from 'mongoose';
import type {
  AppAutoUpdateStatus,
  AppCommands,
  AppOperation,
  AppRelease,
  AppSourceType,
  AppTemplateId,
  ManagedAppStatus,
} from '@/modules/apps/types';

export interface IManagedApp extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  templateId: AppTemplateId;
  sourceType: AppSourceType;
  sourcePath?: string;
  gitUrl?: string;
  gitBranch?: string;
  gitCurrentSha?: string;
  gitLastCheckedAt?: Date;
  gitLastUpdatedAt?: Date;
  autoUpdate: {
    enabled: boolean;
    intervalMinutes: number;
    nextRunAt?: Date;
    lastRunAt?: Date;
    lastStatus?: AppAutoUpdateStatus;
    lastError?: string;
  };
  domain: string;
  port: number;
  commands: AppCommands;
  envVars: Map<string, string>;
  healthCheckPath: string;
  tlsEnabled: boolean;
  status: ManagedAppStatus;
  currentReleaseId?: string;
  operations: Array<
    Omit<AppOperation, 'startedAt' | 'completedAt'> & {
      startedAt: Date;
      completedAt?: Date;
    }
  >;
  releases: Array<
    Omit<AppRelease, 'createdAt' | 'activatedAt'> & {
      createdAt: Date;
      activatedAt?: Date;
    }
  >;
  lastDeployedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const ReleaseSchema = new Schema(
  {
    id: { type: String, required: true },
    status: {
      type: String,
      enum: ['building', 'active', 'failed', 'superseded'],
      required: true,
    },
    createdAt: { type: Date, required: true },
    activatedAt: { type: Date },
    error: { type: String },
    logs: { type: [String], default: [] },
  },
  { _id: false }
);

const AutoUpdateSchema = new Schema(
  {
    enabled: { type: Boolean, required: true, default: false },
    intervalMinutes: { type: Number, required: true, min: 5, max: 10080, default: 60 },
    nextRunAt: { type: Date },
    lastRunAt: { type: Date },
    lastStatus: {
      type: String,
      enum: ['idle', 'updated', 'unchanged', 'failed'],
    },
    lastError: { type: String },
  },
  { _id: false }
);

const OperationSchema = new Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ['deploy', 'update', 'rollback', 'delete'],
      required: true,
    },
    status: {
      type: String,
      enum: ['running', 'succeeded', 'failed', 'unchanged'],
      required: true,
    },
    title: { type: String, required: true },
    step: { type: String, required: true },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date },
    releaseId: { type: String },
    commitSha: { type: String },
    error: { type: String },
    logs: { type: [String], default: [] },
  },
  { _id: false }
);

const ManagedAppSchema = new Schema<IManagedApp>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true, trim: true },
    templateId: { type: String, enum: ['nextjs'], required: true, default: 'nextjs' },
    sourceType: { type: String, enum: ['local', 'git'], required: true, default: 'local' },
    sourcePath: { type: String, trim: true },
    gitUrl: { type: String, trim: true },
    gitBranch: { type: String, trim: true },
    gitCurrentSha: { type: String, trim: true },
    gitLastCheckedAt: { type: Date },
    gitLastUpdatedAt: { type: Date },
    autoUpdate: {
      type: AutoUpdateSchema,
      default: () => ({ enabled: false, intervalMinutes: 60 }),
    },
    domain: { type: String, required: true, unique: true, index: true, trim: true },
    port: { type: Number, required: true, min: 1, max: 65535 },
    commands: {
      install: { type: String, required: true },
      build: { type: String, required: true },
      start: { type: String, required: true },
    },
    envVars: { type: Map, of: String, default: {} },
    healthCheckPath: { type: String, required: true, default: '/' },
    tlsEnabled: { type: Boolean, required: true, default: false },
    status: {
      type: String,
      enum: ['draft', 'deploying', 'running', 'failed', 'stopped', 'unknown'],
      default: 'draft',
      index: true,
    },
    currentReleaseId: { type: String },
    releases: { type: [ReleaseSchema], default: [] },
    operations: { type: [OperationSchema], default: [] },
    lastDeployedAt: { type: Date },
  },
  { timestamps: true }
);

const ManagedApp: Model<IManagedApp> =
  (mongoose.models.ManagedApp as Model<IManagedApp>) ||
  mongoose.model<IManagedApp>('ManagedApp', ManagedAppSchema);

export default ManagedApp;
