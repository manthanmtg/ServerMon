import mongoose, { Schema, Document, Model } from 'mongoose';
import type { AIRunnerPromptType } from '@/modules/ai-runner/types';

export interface IAIRunnerPrompt extends Document {
  name: string;
  content: string;
  type: AIRunnerPromptType;
  agentProfileId: mongoose.Types.ObjectId;
  workingDirectory: string;
  timeout: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const AIRunnerPromptSchema = new Schema<IAIRunnerPrompt>(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    content: { type: String, required: true, maxlength: 100_000 },
    type: { type: String, required: true, enum: ['inline', 'file-reference'] },
    agentProfileId: { type: Schema.Types.ObjectId, ref: 'AIRunnerProfile', required: true },
    workingDirectory: { type: String, required: true, trim: true, maxlength: 2000 },
    timeout: { type: Number, required: true, min: 1, max: 24 * 60 },
    tags: [{ type: String, trim: true, maxlength: 40 }],
  },
  { timestamps: true }
);

AIRunnerPromptSchema.index({ agentProfileId: 1, updatedAt: -1 });
AIRunnerPromptSchema.index({ tags: 1 });

const AIRunnerPrompt: Model<IAIRunnerPrompt> =
  mongoose.models.AIRunnerPrompt ||
  mongoose.model<IAIRunnerPrompt>('AIRunnerPrompt', AIRunnerPromptSchema);

export default AIRunnerPrompt;
