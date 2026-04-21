import mongoose, { Schema, Document, Model } from 'mongoose';
import type {
  AIRunnerJobStatus,
  AIRunnerRunStatus,
  AIRunnerTrigger,
} from '@/modules/ai-runner/types';

export interface IAIRunnerRun extends Document {
  jobId?: mongoose.Types.ObjectId;
  promptId?: mongoose.Types.ObjectId;
  scheduleId?: mongoose.Types.ObjectId;
  agentProfileId: mongoose.Types.ObjectId;
  promptContent: string;
  workingDirectory: string;
  command: string;
  pid?: number;
  status: AIRunnerRunStatus;
  exitCode?: number;
  stdout: string;
  stderr: string;
  rawOutput: string;
  startedAt: Date;
  finishedAt?: Date;
  durationSeconds?: number;
  triggeredBy: AIRunnerTrigger;
  jobStatus?: AIRunnerJobStatus;
  attemptCount?: number;
  maxAttempts?: number;
  heartbeatAt?: Date;
  lastOutputAt?: Date;
  lastError?: string;
  resourceUsage?: {
    peakCpuPercent: number;
    peakMemoryBytes: number;
    peakMemoryPercent: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const AIRunnerRunSchema = new Schema<IAIRunnerRun>(
  {
    jobId: { type: Schema.Types.ObjectId, ref: 'AIRunnerJob' },
    promptId: { type: Schema.Types.ObjectId, ref: 'AIRunnerPrompt' },
    scheduleId: { type: Schema.Types.ObjectId, ref: 'AIRunnerSchedule' },
    agentProfileId: { type: Schema.Types.ObjectId, ref: 'AIRunnerProfile', required: true },
    promptContent: { type: String, required: true, maxlength: 100_000 },
    workingDirectory: { type: String, required: true, trim: true, maxlength: 2000 },
    command: { type: String, required: true, maxlength: 20_000 },
    pid: { type: Number },
    status: {
      type: String,
      required: true,
      enum: ['queued', 'running', 'retrying', 'completed', 'failed', 'timeout', 'killed'],
      index: true,
    },
    exitCode: { type: Number },
    stdout: { type: String, default: '', maxlength: 1_000_000 },
    stderr: { type: String, default: '', maxlength: 1_000_000 },
    rawOutput: { type: String, default: '', maxlength: 1_000_000 },
    startedAt: { type: Date, required: true, index: true },
    finishedAt: { type: Date },
    durationSeconds: { type: Number },
    triggeredBy: { type: String, required: true, enum: ['manual', 'schedule'] },
    jobStatus: {
      type: String,
      enum: ['queued', 'dispatched', 'running', 'retrying', 'completed', 'failed', 'canceled'],
      index: true,
    },
    attemptCount: { type: Number, default: 0, min: 0 },
    maxAttempts: { type: Number, default: 1, min: 1 },
    heartbeatAt: { type: Date },
    lastOutputAt: { type: Date },
    lastError: { type: String, maxlength: 10_000 },
    resourceUsage: {
      peakCpuPercent: { type: Number },
      peakMemoryBytes: { type: Number },
      peakMemoryPercent: { type: Number },
    },
  },
  { timestamps: true }
);

AIRunnerRunSchema.index({ status: 1, startedAt: -1 });
AIRunnerRunSchema.index({ jobStatus: 1, startedAt: -1 });
AIRunnerRunSchema.index({ promptId: 1, startedAt: -1 });
AIRunnerRunSchema.index({ scheduleId: 1, startedAt: -1 });
AIRunnerRunSchema.index({ startedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const AIRunnerRun: Model<IAIRunnerRun> =
  mongoose.models.AIRunnerRun || mongoose.model<IAIRunnerRun>('AIRunnerRun', AIRunnerRunSchema);

export default AIRunnerRun;
