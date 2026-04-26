import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IAIRunnerWorkspace extends Document {
  name: string;
  path: string;
  blocking: boolean;
  enabled: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AIRunnerWorkspaceSchema = new Schema<IAIRunnerWorkspace>(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    path: { type: String, required: true, trim: true, maxlength: 2000, unique: true },
    blocking: { type: Boolean, default: true },
    enabled: { type: Boolean, default: true },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

AIRunnerWorkspaceSchema.index({ enabled: -1, updatedAt: -1 });

const AIRunnerWorkspace: Model<IAIRunnerWorkspace> =
  mongoose.models.AIRunnerWorkspace ||
  mongoose.model<IAIRunnerWorkspace>('AIRunnerWorkspace', AIRunnerWorkspaceSchema);

export default AIRunnerWorkspace;
