import mongoose, { Document, Model, Schema } from 'mongoose';
import type {
  AppCommands,
  AppRelease,
  AppTemplateId,
  ManagedAppStatus,
} from '@/modules/apps/types';

export interface IManagedApp extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  templateId: AppTemplateId;
  sourcePath: string;
  domain: string;
  port: number;
  commands: AppCommands;
  envVars: Map<string, string>;
  healthCheckPath: string;
  tlsEnabled: boolean;
  status: ManagedAppStatus;
  currentReleaseId?: string;
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

const ManagedAppSchema = new Schema<IManagedApp>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true, trim: true },
    templateId: { type: String, enum: ['nextjs'], required: true, default: 'nextjs' },
    sourcePath: { type: String, required: true },
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
    lastDeployedAt: { type: Date },
  },
  { timestamps: true }
);

const ManagedApp: Model<IManagedApp> =
  (mongoose.models.ManagedApp as Model<IManagedApp>) ||
  mongoose.model<IManagedApp>('ManagedApp', ManagedAppSchema);

export default ManagedApp;
