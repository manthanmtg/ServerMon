import mongoose, { Schema, Document, Model } from 'mongoose';
import { z } from 'zod';

const NginxRuntimeStateZ = z.enum(['running', 'stopped', 'reloading', 'unknown']);

export const NginxStateZodSchema = z.object({
  key: z.string().default('global'),
  managed: z.boolean().default(false),
  managedDir: z.string().optional(),
  binaryPath: z.string().optional(),
  runtimeState: NginxRuntimeStateZ.default('unknown'),
  lastTestAt: z.date().optional(),
  lastTestOutput: z.string().optional(),
  lastTestSuccess: z.boolean().optional(),
  lastReloadAt: z.date().optional(),
  lastReloadSuccess: z.boolean().optional(),
  managedServerNames: z.array(z.string()).default([]),
  detectedConflicts: z
    .array(
      z.object({
        serverName: z.string(),
        filePath: z.string(),
        reason: z.string(),
      })
    )
    .default([]),
  activeCertificateProvider: z.string().optional(),
});

export type INginxStateDTO = z.infer<typeof NginxStateZodSchema>;

export interface INginxState extends Document, INginxStateDTO {
  _id: mongoose.Types.ObjectId;
}

const ConflictSub = new Schema(
  {
    serverName: { type: String, required: true },
    filePath: { type: String, required: true },
    reason: { type: String, required: true },
  },
  { _id: false }
);

const NginxStateSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    managed: { type: Boolean, default: false },
    managedDir: { type: String },
    binaryPath: { type: String },
    runtimeState: {
      type: String,
      enum: ['running', 'stopped', 'reloading', 'unknown'],
      default: 'unknown',
    },
    lastTestAt: { type: Date },
    lastTestOutput: { type: String },
    lastTestSuccess: { type: Boolean },
    lastReloadAt: { type: Date },
    lastReloadSuccess: { type: Boolean },
    managedServerNames: [{ type: String }],
    detectedConflicts: [ConflictSub],
    activeCertificateProvider: { type: String },
  },
  { timestamps: true }
);

const NginxState: Model<INginxState> =
  (mongoose.models.NginxState as Model<INginxState>) ||
  mongoose.model<INginxState>('NginxState', NginxStateSchema);

export default NginxState;
