import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IAIRunnerSettings extends Document<string> {
  _id: string;
  schedulesGloballyEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AIRunnerSettingsSchema = new Schema<IAIRunnerSettings>(
  {
    _id: { type: String, default: 'airunner-settings' },
    schedulesGloballyEnabled: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false }
);

const AIRunnerSettings: Model<IAIRunnerSettings> =
  mongoose.models.AIRunnerSettings ||
  mongoose.model<IAIRunnerSettings>('AIRunnerSettings', AIRunnerSettingsSchema);

export default AIRunnerSettings;
