import mongoose, { Schema, Document, Model } from 'mongoose';
import { z } from 'zod';

export const ConfigRevisionZodSchema = z.object({
  kind: z.enum(['frps', 'frpc', 'nginx']),
  targetId: z.string().optional(),
  version: z.number().int().min(1),
  hash: z.string().min(1),
  rendered: z.string().max(500000),
  structured: z.unknown(),
  appliedAt: z.date().optional(),
  rolledBackAt: z.date().optional(),
  supersededBy: z.string().optional(),
  rollbackOf: z.string().optional(),
  createdBy: z.string().optional(),
  diffFromPrevious: z.string().optional(),
});

export type IConfigRevisionDTO = z.infer<typeof ConfigRevisionZodSchema>;

export interface IConfigRevision extends Document, IConfigRevisionDTO {
  _id: mongoose.Types.ObjectId;
}

const ConfigRevisionSchema = new Schema(
  {
    kind: { type: String, enum: ['frps', 'frpc', 'nginx'], required: true },
    targetId: { type: String },
    version: { type: Number, required: true, min: 1 },
    hash: { type: String, required: true },
    rendered: { type: String, required: true },
    structured: { type: Schema.Types.Mixed, required: true },
    appliedAt: { type: Date },
    rolledBackAt: { type: Date },
    supersededBy: { type: String },
    rollbackOf: { type: String },
    createdBy: { type: String },
    diffFromPrevious: { type: String },
  },
  { timestamps: true }
);

ConfigRevisionSchema.index({ kind: 1, targetId: 1, version: -1 });
ConfigRevisionSchema.index({ hash: 1 });

const ConfigRevision: Model<IConfigRevision> =
  (mongoose.models.ConfigRevision as Model<IConfigRevision>) ||
  mongoose.model<IConfigRevision>('ConfigRevision', ConfigRevisionSchema);

export default ConfigRevision;
