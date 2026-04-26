import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IAIRunnerSettings extends Document<string> {
  _id: string;
  schedulesGloballyEnabled: boolean;
  autoflowMode: 'sequential' | 'parallel';
  artifactBaseDir?: string;
  maxConcurrentRuns: number;
  mongoRetentionDays: number;
  artifactRetentionDays: number;
  createdAt: Date;
  updatedAt: Date;
}

const AIRunnerSettingsSchema = new Schema<IAIRunnerSettings>(
  {
    _id: { type: String, default: 'airunner-settings' },
    schedulesGloballyEnabled: { type: Boolean, default: true },
    autoflowMode: { type: String, enum: ['sequential', 'parallel'], default: 'sequential' },
    artifactBaseDir: { type: String, trim: true, maxlength: 2000 },
    maxConcurrentRuns: { type: Number, default: 3, min: 1, max: 8 },
    mongoRetentionDays: { type: Number, default: 30, min: 1, max: 3650 },
    artifactRetentionDays: { type: Number, default: 90, min: 1, max: 3650 },
  },
  { timestamps: true, versionKey: false }
);

const AIRunnerSettings: Model<IAIRunnerSettings> =
  mongoose.models.AIRunnerSettings ||
  mongoose.model<IAIRunnerSettings>('AIRunnerSettings', AIRunnerSettingsSchema);

export default AIRunnerSettings;
