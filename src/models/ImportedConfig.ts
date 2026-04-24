import mongoose, { Schema, Document, Model } from 'mongoose';
import { z } from 'zod';

const KindZ = z.enum(['frp', 'nginx']);
const StatusZ = z.enum(['unmanaged', 'adopted', 'conflict']);

export const ImportedConfigZodSchema = z.object({
  kind: KindZ,
  sourcePath: z.string().optional(),
  raw: z.string().max(500000),
  parsed: z.unknown().optional(),
  status: StatusZ.default('unmanaged'),
  conflicts: z.array(z.string()).default([]),
  adoptedNodeId: z.string().optional(),
  adoptedRouteId: z.string().optional(),
  importedAt: z.date().default(() => new Date()),
  importedBy: z.string().optional(),
});

export type IImportedConfigDTO = z.infer<typeof ImportedConfigZodSchema>;

export interface IImportedConfig extends Document, IImportedConfigDTO {
  _id: mongoose.Types.ObjectId;
}

const ImportedConfigSchema = new Schema(
  {
    kind: { type: String, enum: ['frp', 'nginx'], required: true },
    sourcePath: { type: String },
    raw: { type: String, required: true },
    parsed: { type: Schema.Types.Mixed },
    status: {
      type: String,
      enum: ['unmanaged', 'adopted', 'conflict'],
      default: 'unmanaged',
    },
    conflicts: [{ type: String }],
    adoptedNodeId: { type: String },
    adoptedRouteId: { type: String },
    importedAt: { type: Date, default: () => new Date() },
    importedBy: { type: String },
  },
  { timestamps: true }
);

ImportedConfigSchema.index({ kind: 1, status: 1 });

const ImportedConfig: Model<IImportedConfig> =
  (mongoose.models.ImportedConfig as Model<IImportedConfig>) ||
  mongoose.model<IImportedConfig>('ImportedConfig', ImportedConfigSchema);

export default ImportedConfig;
