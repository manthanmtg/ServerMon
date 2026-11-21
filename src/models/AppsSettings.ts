import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IAppsSettings extends Document {
  releaseRetention: number;
  updatedAt: Date;
}

const AppsSettingsSchema: Schema = new Schema(
  {
    _id: { type: String, default: 'apps-settings' },
    releaseRetention: {
      type: Number,
      default: 10,
      min: 1,
      max: 50,
    },
  },
  { timestamps: true }
);

const AppsSettings: Model<IAppsSettings> =
  mongoose.models.AppsSettings || mongoose.model<IAppsSettings>('AppsSettings', AppsSettingsSchema);

export default AppsSettings;
