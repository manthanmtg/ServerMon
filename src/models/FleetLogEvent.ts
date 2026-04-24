import mongoose, { Schema, Document, Model } from 'mongoose';
import { z } from 'zod';
import { FLEET_LOG_LEVELS, FLEET_LOG_SERVICES } from '@/lib/fleet/enums';

export const FleetLogEventZodSchema = z.object({
  nodeId: z.string().optional(),
  routeId: z.string().optional(),
  service: z.enum(FLEET_LOG_SERVICES),
  level: z.enum(FLEET_LOG_LEVELS),
  eventType: z.string().min(1).max(80),
  message: z.string().max(2000).default(''),
  metadata: z.record(z.string(), z.unknown()).optional(),
  correlationId: z.string().optional(),
  audit: z.boolean().default(false),
  actorUserId: z.string().optional(),
  retentionUntil: z.date().optional(),
});

export type IFleetLogEventDTO = z.infer<typeof FleetLogEventZodSchema>;

export interface IFleetLogEvent extends Document, IFleetLogEventDTO {
  _id: mongoose.Types.ObjectId;
}

const FleetLogEventSchema = new Schema(
  {
    nodeId: { type: String },
    routeId: { type: String },
    service: { type: String, enum: FLEET_LOG_SERVICES, required: true },
    level: { type: String, enum: FLEET_LOG_LEVELS, required: true },
    eventType: { type: String, required: true },
    message: { type: String, default: '' },
    metadata: { type: Schema.Types.Mixed },
    correlationId: { type: String },
    audit: { type: Boolean, default: false },
    actorUserId: { type: String },
    retentionUntil: { type: Date },
  },
  { timestamps: true }
);

FleetLogEventSchema.index({ nodeId: 1, createdAt: -1 });
FleetLogEventSchema.index({ service: 1, level: 1, createdAt: -1 });
FleetLogEventSchema.index({ retentionUntil: 1 }, { expireAfterSeconds: 0 });

const FleetLogEvent: Model<IFleetLogEvent> =
  (mongoose.models.FleetLogEvent as Model<IFleetLogEvent>) ||
  mongoose.model<IFleetLogEvent>('FleetLogEvent', FleetLogEventSchema);

export default FleetLogEvent;
