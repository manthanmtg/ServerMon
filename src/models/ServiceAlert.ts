import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IServiceAlert extends Document {
  fingerprint: string;
  severity: 'warning' | 'critical';
  title: string;
  message: string;
  service: string;
  metadata?: Record<string, unknown>;
  active: boolean;
  firstSeenAt: Date;
  lastSeenAt: Date;
  resolvedAt?: Date;
}

const ServiceAlertSchema = new Schema(
  {
    fingerprint: { type: String, required: true, unique: true, index: true },
    severity: { type: String, enum: ['warning', 'critical'], required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    service: { type: String, required: true, index: true },
    metadata: { type: Schema.Types.Mixed },
    active: { type: Boolean, default: true, index: true },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

const ServiceAlert: Model<IServiceAlert> =
  mongoose.models.ServiceAlert || mongoose.model<IServiceAlert>('ServiceAlert', ServiceAlertSchema);

export default ServiceAlert;
