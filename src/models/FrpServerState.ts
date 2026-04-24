import mongoose, { Schema, Document, Model } from 'mongoose';
import { z } from 'zod';
import { SERVICE_STATES } from '@/lib/fleet/enums';

export const FrpServerStateZodSchema = z.object({
  key: z.string().default('global'),
  enabled: z.boolean().default(false),
  runtimeState: z.enum(SERVICE_STATES).default('stopped'),
  bindPort: z.number().int().min(1).max(65535).default(7000),
  vhostHttpPort: z.number().int().min(1).max(65535).default(8080),
  vhostHttpsPort: z.number().int().min(1).max(65535).optional(),
  subdomainHost: z.string().max(253).optional(),
  authTokenHash: z.string().optional(),
  authTokenPrefix: z.string().optional(),
  generatedConfigHash: z.string().optional(),
  configVersion: z.number().int().min(0).default(0),
  lastRestartAt: z.date().optional(),
  lastError: z
    .object({
      code: z.string(),
      message: z.string(),
      occurredAt: z.date(),
    })
    .optional(),
  activeConnections: z.number().int().min(0).default(0),
  connectedNodeIds: z.array(z.string()).default([]),
});

export type IFrpServerStateDTO = z.infer<typeof FrpServerStateZodSchema>;

export interface IFrpServerState extends Document, IFrpServerStateDTO {
  _id: mongoose.Types.ObjectId;
}

const FrpServerStateSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    enabled: { type: Boolean, default: false },
    runtimeState: { type: String, enum: SERVICE_STATES, default: 'stopped' },
    bindPort: { type: Number, default: 7000 },
    vhostHttpPort: { type: Number, default: 8080 },
    vhostHttpsPort: { type: Number },
    subdomainHost: { type: String },
    authTokenHash: { type: String },
    authTokenPrefix: { type: String },
    generatedConfigHash: { type: String },
    configVersion: { type: Number, default: 0 },
    lastRestartAt: { type: Date },
    lastError: {
      code: String,
      message: String,
      occurredAt: Date,
    },
    activeConnections: { type: Number, default: 0 },
    connectedNodeIds: [{ type: String }],
  },
  { timestamps: true }
);

const FrpServerState: Model<IFrpServerState> =
  (mongoose.models.FrpServerState as Model<IFrpServerState>) ||
  mongoose.model<IFrpServerState>('FrpServerState', FrpServerStateSchema);

export default FrpServerState;
