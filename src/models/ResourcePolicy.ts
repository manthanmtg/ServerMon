import mongoose, { Schema, Document, Model } from 'mongoose';
import { z } from 'zod';

const ScopeZ = z.enum(['global', 'node', 'tag', 'role']);
const EnforcementZ = z.enum(['soft', 'hard']);

const LimitsZ = z.object({
  maxAgents: z.number().int().min(0).optional(),
  maxPublicRoutes: z.number().int().min(0).optional(),
  maxProxiesPerNode: z.number().int().min(0).optional(),
  maxActiveTerminals: z.number().int().min(0).optional(),
  maxEndpointRuns: z.number().int().min(0).optional(),
  logRetentionDays: z.number().int().min(0).optional(),
  logStorageMb: z.number().int().min(0).optional(),
  bandwidthWarnMbps: z.number().min(0).optional(),
  uploadBodyMb: z.number().int().min(0).optional(),
  requestTimeoutSec: z.number().int().min(0).optional(),
  updateBatchSize: z.number().int().min(0).optional(),
});

const EnforcementMapZ = z.object({
  maxAgents: EnforcementZ.optional(),
  maxPublicRoutes: EnforcementZ.optional(),
  maxProxiesPerNode: EnforcementZ.optional(),
  maxActiveTerminals: EnforcementZ.optional(),
  maxEndpointRuns: EnforcementZ.optional(),
  logRetentionDays: EnforcementZ.optional(),
  logStorageMb: EnforcementZ.optional(),
  bandwidthWarnMbps: EnforcementZ.optional(),
  uploadBodyMb: EnforcementZ.optional(),
  requestTimeoutSec: EnforcementZ.optional(),
  updateBatchSize: EnforcementZ.optional(),
});

export const ResourcePolicyZodSchema = z.object({
  scope: ScopeZ,
  scopeId: z.string().optional(),
  limits: LimitsZ.default({}),
  enforcement: EnforcementMapZ.default({}),
  description: z.string().optional(),
});

export type IResourcePolicyDTO = z.infer<typeof ResourcePolicyZodSchema>;

export interface IResourcePolicy extends Document, IResourcePolicyDTO {
  _id: mongoose.Types.ObjectId;
}

const ResourcePolicySchema = new Schema(
  {
    scope: {
      type: String,
      enum: ['global', 'node', 'tag', 'role'],
      required: true,
    },
    scopeId: { type: String },
    limits: {
      maxAgents: Number,
      maxPublicRoutes: Number,
      maxProxiesPerNode: Number,
      maxActiveTerminals: Number,
      maxEndpointRuns: Number,
      logRetentionDays: Number,
      logStorageMb: Number,
      bandwidthWarnMbps: Number,
      uploadBodyMb: Number,
      requestTimeoutSec: Number,
      updateBatchSize: Number,
    },
    enforcement: {
      maxAgents: { type: String, enum: ['soft', 'hard'] },
      maxPublicRoutes: { type: String, enum: ['soft', 'hard'] },
      maxProxiesPerNode: { type: String, enum: ['soft', 'hard'] },
      maxActiveTerminals: { type: String, enum: ['soft', 'hard'] },
      maxEndpointRuns: { type: String, enum: ['soft', 'hard'] },
      logRetentionDays: { type: String, enum: ['soft', 'hard'] },
      logStorageMb: { type: String, enum: ['soft', 'hard'] },
      bandwidthWarnMbps: { type: String, enum: ['soft', 'hard'] },
      uploadBodyMb: { type: String, enum: ['soft', 'hard'] },
      requestTimeoutSec: { type: String, enum: ['soft', 'hard'] },
      updateBatchSize: { type: String, enum: ['soft', 'hard'] },
    },
    description: { type: String },
  },
  { timestamps: true }
);

ResourcePolicySchema.index({ scope: 1, scopeId: 1 });

const ResourcePolicy: Model<IResourcePolicy> =
  (mongoose.models.ResourcePolicy as Model<IResourcePolicy>) ||
  mongoose.model<IResourcePolicy>('ResourcePolicy', ResourcePolicySchema);

export default ResourcePolicy;
