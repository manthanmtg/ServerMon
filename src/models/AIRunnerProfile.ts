import mongoose, { Schema, Document, Model } from 'mongoose';
import type { AIRunnerAgentType } from '@/modules/ai-runner/types';

export interface IAIRunnerProfile extends Document {
  name: string;
  slug: string;
  agentType: AIRunnerAgentType;
  invocationTemplate: string;
  defaultTimeout: number;
  maxTimeout: number;
  shell: string;
  requiresTTY: boolean;
  env: Record<string, string>;
  enabled: boolean;
  icon?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AIRunnerProfileSchema = new Schema<IAIRunnerProfile>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, trim: true, maxlength: 120, unique: true },
    agentType: {
      type: String,
      required: true,
      enum: ['claude-code', 'codex', 'opencode', 'aider', 'gemini-cli', 'custom'],
    },
    invocationTemplate: { type: String, required: true, maxlength: 10_000 },
    defaultTimeout: { type: Number, required: true, min: 1, max: 24 * 60 },
    maxTimeout: { type: Number, required: true, min: 1, max: 24 * 60 },
    shell: { type: String, required: true, default: '/bin/bash', maxlength: 260 },
    requiresTTY: { type: Boolean, default: false },
    env: { type: Map, of: String, default: {} },
    enabled: { type: Boolean, default: true },
    icon: { type: String, trim: true, maxlength: 60 },
  },
  { timestamps: true }
);

AIRunnerProfileSchema.index({ slug: 1 }, { unique: true });
AIRunnerProfileSchema.index({ enabled: 1, updatedAt: -1 });

const AIRunnerProfile: Model<IAIRunnerProfile> =
  mongoose.models.AIRunnerProfile ||
  mongoose.model<IAIRunnerProfile>('AIRunnerProfile', AIRunnerProfileSchema);

export default AIRunnerProfile;
