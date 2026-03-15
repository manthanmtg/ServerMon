import mongoose, { Schema, Document } from 'mongoose';

export interface IAnalyticsEvent extends Document {
  moduleId: string;
  event: string;
  metadata: Record<string, unknown>;
  timestamp: Date;
  severity: 'info' | 'warn' | 'error';
}

const AnalyticsEventSchema: Schema = new Schema({
  moduleId: { type: String, required: true, index: true },
  event: { type: String, required: true, index: true },
  metadata: { type: Schema.Types.Mixed, default: {} },
  timestamp: { type: Date, default: Date.now, index: true },
  severity: {
    type: String,
    enum: ['info', 'warn', 'error'],
    default: 'info',
    index: true,
  },
});

// TTL Index: Automatically delete events older than 30 days to keep DB size manageable
AnalyticsEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });

export default mongoose.models.AnalyticsEvent ||
  mongoose.model<IAnalyticsEvent>('AnalyticsEvent', AnalyticsEventSchema);
