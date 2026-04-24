import mongoose, { Schema, Document, Model } from 'mongoose';
import { z } from 'zod';

export const ALERT_CHANNEL_KINDS = ['webhook', 'slack', 'email'] as const;
export type AlertChannelKind = (typeof ALERT_CHANNEL_KINDS)[number];

export const ALERT_SEVERITIES = ['info', 'warn', 'error'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const AlertChannelZodSchema = z.object({
  name: z.string().min(1).max(120).trim(),
  slug: z
    .string()
    .min(1)
    .max(120)
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  kind: z.enum(ALERT_CHANNEL_KINDS),
  config: z.record(z.string(), z.unknown()).default({}),
  enabled: z.boolean().default(true),
  minSeverity: z.enum(ALERT_SEVERITIES).default('warn'),
  lastTriggeredAt: z.date().optional(),
  lastSuccess: z.boolean().optional(),
  lastError: z.string().optional(),
  description: z.string().max(500).optional(),
});

export type IAlertChannelDTO = z.infer<typeof AlertChannelZodSchema>;

export interface IAlertChannel extends Document, IAlertChannelDTO {
  _id: mongoose.Types.ObjectId;
}

const AlertChannelSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, index: true, trim: true },
    kind: { type: String, enum: ALERT_CHANNEL_KINDS, required: true },
    config: { type: Schema.Types.Mixed, default: {} },
    enabled: { type: Boolean, default: true },
    minSeverity: { type: String, enum: ALERT_SEVERITIES, default: 'warn' },
    lastTriggeredAt: { type: Date },
    lastSuccess: { type: Boolean },
    lastError: { type: String },
    description: { type: String, maxlength: 500 },
  },
  { timestamps: true }
);

AlertChannelSchema.index({ kind: 1, enabled: 1 });

const AlertChannel: Model<IAlertChannel> =
  (mongoose.models.AlertChannel as Model<IAlertChannel>) ||
  mongoose.model<IAlertChannel>('AlertChannel', AlertChannelSchema);

export default AlertChannel;
