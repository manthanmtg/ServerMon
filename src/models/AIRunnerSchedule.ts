import mongoose, { Schema, Document, Model } from 'mongoose';
import type { AIRunnerRunStatus } from '@/modules/ai-runner/types';

export interface IAIRunnerSchedule extends Document {
  name: string;
  promptId: mongoose.Types.ObjectId;
  agentProfileId?: mongoose.Types.ObjectId;
  workingDirectory?: string;
  timeout?: number;
  cronExpression: string;
  enabled: boolean;
  lastRunId?: mongoose.Types.ObjectId;
  lastRunStatus?: AIRunnerRunStatus;
  lastRunAt?: Date;
  nextRunTime?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AIRunnerScheduleSchema = new Schema<IAIRunnerSchedule>(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    promptId: { type: Schema.Types.ObjectId, ref: 'AIRunnerPrompt', required: true },
    agentProfileId: { type: Schema.Types.ObjectId, ref: 'AIRunnerProfile' },
    workingDirectory: { type: String, trim: true, maxlength: 2000 },
    timeout: { type: Number, min: 1, max: 24 * 60 },
    cronExpression: { type: String, required: true, trim: true, maxlength: 120 },
    enabled: { type: Boolean, default: true },
    lastRunId: { type: Schema.Types.ObjectId, ref: 'AIRunnerRun' },
    lastRunStatus: {
      type: String,
      enum: ['queued', 'running', 'completed', 'failed', 'timeout', 'killed'],
    },
    lastRunAt: { type: Date },
    nextRunTime: { type: Date },
  },
  { timestamps: true }
);

AIRunnerScheduleSchema.index({ enabled: 1, nextRunTime: 1 });
AIRunnerScheduleSchema.index({ promptId: 1, updatedAt: -1 });
AIRunnerScheduleSchema.index({ agentProfileId: 1, updatedAt: -1 });

const AIRunnerSchedule: Model<IAIRunnerSchedule> =
  mongoose.models.AIRunnerSchedule ||
  mongoose.model<IAIRunnerSchedule>('AIRunnerSchedule', AIRunnerScheduleSchema);

export default AIRunnerSchedule;
