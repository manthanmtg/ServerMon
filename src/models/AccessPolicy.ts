import mongoose, { Schema, Document, Model } from 'mongoose';
import { z } from 'zod';
import { ACCESS_MODES } from '@/lib/fleet/enums';

export const AccessPolicyZodSchema = z.object({
  name: z.string().min(1).max(120),
  mode: z.enum(ACCESS_MODES),
  ipAllowlist: z.array(z.string()).default([]),
  basicAuth: z
    .array(
      z.object({
        username: z.string().min(1),
        hashedPassword: z.string().min(1),
      })
    )
    .default([]),
  schedule: z
    .object({
      timezone: z.string().optional(),
      windows: z
        .array(
          z.object({
            daysOfWeek: z.array(z.number().int().min(0).max(6)),
            startMinute: z.number().int().min(0).max(1440),
            endMinute: z.number().int().min(0).max(1440),
          })
        )
        .default([]),
    })
    .default({ windows: [] }),
  temporaryShare: z
    .object({
      enabled: z.boolean().default(false),
      expiresAt: z.date().optional(),
      passwordHash: z.string().optional(),
      allowedIps: z.array(z.string()).optional(),
    })
    .default({ enabled: false }),
  allowedUserRoles: z.array(z.string()).default([]),
  description: z.string().optional(),
});

export type IAccessPolicyDTO = z.infer<typeof AccessPolicyZodSchema>;

export interface IAccessPolicy extends Document, IAccessPolicyDTO {
  _id: mongoose.Types.ObjectId;
}

const BasicAuthSub = new Schema(
  {
    username: { type: String, required: true },
    hashedPassword: { type: String, required: true },
  },
  { _id: false }
);

const WindowSub = new Schema(
  {
    daysOfWeek: [{ type: Number }],
    startMinute: { type: Number, required: true },
    endMinute: { type: Number, required: true },
  },
  { _id: false }
);

const AccessPolicySchema = new Schema(
  {
    name: { type: String, required: true },
    mode: { type: String, enum: ACCESS_MODES, required: true },
    ipAllowlist: [{ type: String }],
    basicAuth: [BasicAuthSub],
    schedule: {
      timezone: { type: String },
      windows: [WindowSub],
    },
    temporaryShare: {
      enabled: { type: Boolean, default: false },
      expiresAt: { type: Date },
      passwordHash: { type: String },
      allowedIps: [{ type: String }],
    },
    allowedUserRoles: [{ type: String }],
    description: { type: String },
  },
  { timestamps: true }
);

AccessPolicySchema.index({ name: 1 });

const AccessPolicy: Model<IAccessPolicy> =
  (mongoose.models.AccessPolicy as Model<IAccessPolicy>) ||
  mongoose.model<IAccessPolicy>('AccessPolicy', AccessPolicySchema);

export default AccessPolicy;
