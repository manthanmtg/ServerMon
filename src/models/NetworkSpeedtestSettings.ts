import mongoose, { Document, Model, Schema } from 'mongoose';
import type { NetworkSpeedtestScheduleInterval } from '@/modules/network/types';

export interface INetworkSpeedtestSettings extends Document<string> {
  _id: string;
  scheduleInterval: NetworkSpeedtestScheduleInterval;
  nextRunAt?: Date | null;
  lastScheduledRunAt?: Date | null;
}

const NetworkSpeedtestSettingsSchema = new Schema(
  {
    _id: { type: String, required: true },
    scheduleInterval: {
      type: String,
      enum: ['off', '30m', '1h', '3h', '6h', '24h'],
      default: 'off',
      required: true,
    },
    nextRunAt: { type: Date, default: null },
    lastScheduledRunAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const NetworkSpeedtestSettings: Model<INetworkSpeedtestSettings> =
  mongoose.models.NetworkSpeedtestSettings ||
  mongoose.model<INetworkSpeedtestSettings>(
    'NetworkSpeedtestSettings',
    NetworkSpeedtestSettingsSchema
  );

export default NetworkSpeedtestSettings;
