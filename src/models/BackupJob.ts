import mongoose, { Schema, Document, Model } from 'mongoose';
import { z } from 'zod';

const BackupTypeZ = z.enum(['scheduled', 'manual']);
const BackupScopeZ = z.enum([
  'nodes',
  'publicRoutes',
  'configs',
  'nginx',
  'certs',
  'policies',
  'audit',
  'retention',
  'templates',
  'imported',
]);
const DestinationKindZ = z.enum(['local', 's3', 'other']);
const EncryptionModeZ = z.enum(['none', 'aes256']);
const BackupStatusZ = z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']);

export const BackupJobZodSchema = z.object({
  type: BackupTypeZ,
  scopes: z.array(BackupScopeZ).min(1),
  destination: z.object({
    kind: DestinationKindZ,
    path: z.string().optional(),
    config: z.record(z.string(), z.unknown()).optional(),
  }),
  encryption: z
    .object({
      mode: EncryptionModeZ.default('none'),
      keyRef: z.string().optional(),
    })
    .default({ mode: 'none' }),
  retentionDays: z.number().int().min(1).max(3650).default(30),
  status: BackupStatusZ.default('queued'),
  sizeBytes: z.number().int().min(0).optional(),
  compatibility: z.string().optional(),
  startedAt: z.date().optional(),
  finishedAt: z.date().optional(),
  error: z.string().optional(),
  initiatedBy: z.string().optional(),
  manifestPath: z.string().optional(),
  restoreVerified: z.boolean().optional(),
});

export type IBackupJobDTO = z.infer<typeof BackupJobZodSchema>;

export interface IBackupJob extends Document, IBackupJobDTO {
  _id: mongoose.Types.ObjectId;
}

const BackupJobSchema = new Schema(
  {
    type: { type: String, enum: ['scheduled', 'manual'], required: true },
    scopes: [
      {
        type: String,
        enum: [
          'nodes',
          'publicRoutes',
          'configs',
          'nginx',
          'certs',
          'policies',
          'audit',
          'retention',
          'templates',
          'imported',
        ],
        required: true,
      },
    ],
    destination: {
      kind: {
        type: String,
        enum: ['local', 's3', 'other'],
        required: true,
      },
      path: { type: String },
      config: { type: Schema.Types.Mixed },
    },
    encryption: {
      mode: { type: String, enum: ['none', 'aes256'], default: 'none' },
      keyRef: { type: String },
    },
    retentionDays: { type: Number, default: 30, min: 1, max: 3650 },
    status: {
      type: String,
      enum: ['queued', 'running', 'completed', 'failed', 'cancelled'],
      default: 'queued',
    },
    sizeBytes: { type: Number },
    compatibility: { type: String },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    error: { type: String },
    initiatedBy: { type: String },
    manifestPath: { type: String },
    restoreVerified: { type: Boolean },
  },
  { timestamps: true }
);

BackupJobSchema.index({ status: 1, createdAt: -1 });

const BackupJob: Model<IBackupJob> =
  (mongoose.models.BackupJob as Model<IBackupJob>) ||
  mongoose.model<IBackupJob>('BackupJob', BackupJobSchema);

export default BackupJob;
