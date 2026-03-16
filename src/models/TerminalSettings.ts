import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITerminalSettings extends Document {
  idleTimeoutMinutes: number;
  maxSessions: number;
  fontSize: number;
  loginAsUser: string;
  defaultDirectory: string;
  updatedAt: Date;
}

const TerminalSettingsSchema: Schema = new Schema(
  {
    _id: { type: String, default: 'terminal-settings' },
    idleTimeoutMinutes: { type: Number, default: 30, min: 1, max: 1440 },
    maxSessions: { type: Number, default: 8, min: 1, max: 20 },
    fontSize: { type: Number, default: 14, min: 10, max: 24 },
    loginAsUser: { type: String, default: '' },
    defaultDirectory: { type: String, default: '' },
  },
  { timestamps: true }
);

const TerminalSettings: Model<ITerminalSettings> =
  mongoose.models.TerminalSettings ||
  mongoose.model<ITerminalSettings>('TerminalSettings', TerminalSettingsSchema);

export default TerminalSettings;
