import mongoose, { Schema, Document, Model } from 'mongoose';
import { z } from 'zod';
import { ALERT_SEVERITIES } from './AlertChannel';

export const AlertSubscriptionZodSchema = z.object({
  name: z.string().min(1).max(120),
  channelId: z.string().min(1),
  eventKinds: z.array(z.string().min(1)).default([]),
  minSeverity: z.enum(ALERT_SEVERITIES).default('warn'),
  filters: z
    .object({
      nodeIds: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
      eventTypes: z.array(z.string()).optional(),
    })
    .optional(),
  enabled: z.boolean().default(true),
  throttle: z
    .object({
      windowSec: z.number().int().min(1),
      maxPerWindow: z.number().int().min(1),
    })
    .optional(),
});

export type IAlertSubscriptionDTO = z.infer<typeof AlertSubscriptionZodSchema>;

export interface IAlertSubscription extends Document, IAlertSubscriptionDTO {
  _id: mongoose.Types.ObjectId;
}

const AlertSubscriptionSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 120 },
    channelId: { type: String, required: true, index: true },
    eventKinds: [{ type: String }],
    minSeverity: { type: String, enum: ALERT_SEVERITIES, default: 'warn' },
    filters: {
      nodeIds: [{ type: String }],
      tags: [{ type: String }],
      eventTypes: [{ type: String }],
    },
    enabled: { type: Boolean, default: true, index: true },
    throttle: {
      windowSec: { type: Number },
      maxPerWindow: { type: Number },
    },
  },
  { timestamps: true }
);

AlertSubscriptionSchema.index({ channelId: 1, enabled: 1 });

const AlertSubscription: Model<IAlertSubscription> =
  (mongoose.models.AlertSubscription as Model<IAlertSubscription>) ||
  mongoose.model<IAlertSubscription>('AlertSubscription', AlertSubscriptionSchema);

export default AlertSubscription;
