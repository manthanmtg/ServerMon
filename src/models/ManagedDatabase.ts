import mongoose, { Document, Model, Schema } from 'mongoose';
import type {
  DatabaseRestartPolicy,
  DatabaseExplorerKind,
  DatabaseExplorerStatus,
  DatabaseSslMode,
  DatabaseTemplateId,
  ManagedDatabaseStatus,
} from '@/modules/databases/types';

export interface IManagedDatabase extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  templateId: DatabaseTemplateId;
  version: string;
  image: string;
  host: string;
  port: number;
  internalPort: number;
  username: string;
  password: string;
  databaseName: string;
  dataPath: string;
  publicRoute: boolean;
  bindAddress: '127.0.0.1' | '0.0.0.0';
  sslMode: DatabaseSslMode;
  restartPolicy: DatabaseRestartPolicy;
  extraEnv: Map<string, string>;
  status: ManagedDatabaseStatus;
  containerId?: string;
  containerName?: string;
  logs: string[];
  explorerStatus: DatabaseExplorerStatus;
  explorerKind?: DatabaseExplorerKind;
  explorerImage?: string;
  explorerPort?: number;
  explorerContainerName?: string;
  explorerLogs: string[];
  explorerStartedAt?: Date;
  explorerLastAccessedAt?: Date;
  explorerIdleTimeoutMinutes: number;
  lastDeployedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const ManagedDatabaseSchema = new Schema<IManagedDatabase>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true, trim: true },
    templateId: { type: String, enum: ['mongo', 'postgres', 'mysql'], required: true },
    version: { type: String, required: true, trim: true },
    image: { type: String, required: true, trim: true },
    host: { type: String, required: true, trim: true },
    port: { type: Number, required: true, min: 1, max: 65535 },
    internalPort: { type: Number, required: true, min: 1, max: 65535 },
    username: { type: String, required: true, trim: true },
    password: { type: String, required: true },
    databaseName: { type: String, required: true, trim: true },
    dataPath: { type: String, required: true, trim: true },
    publicRoute: { type: Boolean, required: true, default: false },
    bindAddress: { type: String, enum: ['127.0.0.1', '0.0.0.0'], required: true },
    sslMode: {
      type: String,
      enum: ['disable', 'prefer', 'require'],
      required: true,
      default: 'disable',
    },
    restartPolicy: {
      type: String,
      enum: ['unless-stopped', 'always', 'on-failure', 'no'],
      required: true,
      default: 'unless-stopped',
    },
    extraEnv: { type: Map, of: String, default: {} },
    status: {
      type: String,
      enum: ['draft', 'deploying', 'running', 'stopped', 'failed', 'unknown'],
      required: true,
      default: 'draft',
      index: true,
    },
    containerId: { type: String },
    containerName: { type: String },
    logs: { type: [String], default: [] },
    explorerStatus: {
      type: String,
      enum: ['stopped', 'starting', 'running', 'failed'],
      required: true,
      default: 'stopped',
    },
    explorerKind: { type: String, enum: ['mongo-express', 'pgweb', 'phpmyadmin'] },
    explorerImage: { type: String },
    explorerPort: { type: Number, min: 1, max: 65535 },
    explorerContainerName: { type: String },
    explorerLogs: { type: [String], default: [] },
    explorerStartedAt: { type: Date },
    explorerLastAccessedAt: { type: Date },
    explorerIdleTimeoutMinutes: { type: Number, required: true, default: 30, min: 1, max: 1440 },
    lastDeployedAt: { type: Date },
  },
  { timestamps: true }
);

ManagedDatabaseSchema.index({ templateId: 1 });
ManagedDatabaseSchema.index({ publicRoute: 1 });

const ManagedDatabase: Model<IManagedDatabase> =
  (mongoose.models.ManagedDatabase as Model<IManagedDatabase>) ||
  mongoose.model<IManagedDatabase>('ManagedDatabase', ManagedDatabaseSchema);

export default ManagedDatabase;
