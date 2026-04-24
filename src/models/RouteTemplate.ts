import mongoose, { Schema, Document, Model } from 'mongoose';
import { z } from 'zod';
import { ACCESS_MODES } from '@/lib/fleet/enums';

const KindZ = z.enum(['builtin', 'custom']);
const SourceZ = z.enum(['system', 'user']);
const ProtocolZ = z.enum(['http', 'https', 'tcp']);
const LogLevelZ = z.enum(['debug', 'info', 'warn', 'error']);

export const RouteTemplateZodSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  kind: KindZ.default('custom'),
  description: z.string().optional(),
  defaults: z.object({
    localPort: z.number().int().min(1).max(65535).optional(),
    protocol: ProtocolZ,
    websocket: z.boolean(),
    timeoutSec: z.number().int().min(1).max(3600),
    uploadBodyMb: z.number().int().min(1).max(1024),
    headers: z.record(z.string(), z.string()),
    accessMode: z.enum(ACCESS_MODES),
    healthPath: z.string().optional(),
    logLevel: LogLevelZ,
  }),
  source: SourceZ.default('user'),
  createdBy: z.string().optional(),
});

export type IRouteTemplateDTO = z.infer<typeof RouteTemplateZodSchema>;

export interface IRouteTemplate extends Document, IRouteTemplateDTO {
  _id: mongoose.Types.ObjectId;
}

const RouteTemplateSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    kind: { type: String, enum: ['builtin', 'custom'], default: 'custom' },
    description: { type: String },
    defaults: {
      localPort: { type: Number },
      protocol: {
        type: String,
        enum: ['http', 'https', 'tcp'],
        required: true,
      },
      websocket: { type: Boolean, required: true },
      timeoutSec: { type: Number, required: true },
      uploadBodyMb: { type: Number, required: true },
      headers: { type: Map, of: String, default: {} },
      accessMode: { type: String, enum: ACCESS_MODES, required: true },
      healthPath: { type: String },
      logLevel: {
        type: String,
        enum: ['debug', 'info', 'warn', 'error'],
        required: true,
      },
    },
    source: { type: String, enum: ['system', 'user'], default: 'user' },
    createdBy: { type: String },
  },
  { timestamps: true }
);

RouteTemplateSchema.index({ kind: 1 });

const RouteTemplate: Model<IRouteTemplate> =
  (mongoose.models.RouteTemplate as Model<IRouteTemplate>) ||
  mongoose.model<IRouteTemplate>('RouteTemplate', RouteTemplateSchema);

export default RouteTemplate;
