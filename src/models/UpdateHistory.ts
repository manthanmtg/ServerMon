import mongoose, { Schema, Document } from 'mongoose';

export interface IUpdateHistory extends Document {
  timestamp: Date;
  packages: string[];
  count: number;
  success: boolean;
  error?: string;
  osVersion?: string;
}

const UpdateHistorySchema: Schema = new Schema({
  timestamp: { type: Date, default: Date.now, index: true },
  packages: [{ type: String }],
  count: { type: Number, required: true },
  success: { type: Boolean, required: true },
  error: { type: String },
  osVersion: { type: String },
});

export default mongoose.models.UpdateHistory ||
  mongoose.model<IUpdateHistory>('UpdateHistory', UpdateHistorySchema);
