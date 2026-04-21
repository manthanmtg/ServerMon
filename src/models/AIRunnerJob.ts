import mongoose, { Document, Model, Schema } from 'mongoose';
import type { AIRunnerJobStatus, AIRunnerTrigger } from '@/modules/ai-runner/types';

export interface IAIRunnerJob extends Document {
  runId: mongoose.Types.ObjectId;
  promptId?: mongoose.Types.ObjectId;
  scheduleId?: mongoose.Types.ObjectId;
  agentProfileId: mongoose.Types.ObjectId;
  triggeredBy: AIRunnerTrigger;
  promptContent: string;
  workingDirectory: string;
  command: string;
  shell: string;
  requiresTTY: boolean;
  env: Map<string, string> | Record<string, string>;
  timeoutMinutes: number;
  status: AIRunnerJobStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt?: Date;
  scheduledFor?: Date;
  dispatchedAt?: Date;
  startedAt?: Date;
  finishedAt?: Date;
  heartbeatAt?: Date;
  lastOutputAt?: Date;
  cancelRequestedAt?: Date;
  lastError?: string;
  exitCode?: number;
  workerPid?: number;
  childPid?: number;
  createdAt: Date;
  updatedAt: Date;
}

const AIRunnerJobSchema = new Schema<IAIRunnerJob>(
  {
    runId: { type: Schema.Types.ObjectId, ref: 'AIRunnerRun', required: true, unique: true },
    promptId: { type: Schema.Types.ObjectId, ref: 'AIRunnerPrompt' },
    scheduleId: { type: Schema.Types.ObjectId, ref: 'AIRunnerSchedule' },
    agentProfileId: { type: Schema.Types.ObjectId, ref: 'AIRunnerProfile', required: true },
    triggeredBy: { type: String, required: true, enum: ['manual', 'schedule'] },
    promptContent: { type: String, required: true, maxlength: 100_000 },
    workingDirectory: { type: String, required: true, trim: true, maxlength: 2000 },
    command: { type: String, required: true, maxlength: 20_000 },
    shell: { type: String, required: true, maxlength: 512 },
    requiresTTY: { type: Boolean, default: false },
    env: { type: Map, of: String, default: {} },
    timeoutMinutes: { type: Number, required: true, min: 1, max: 24 * 60 },
    status: {
      type: String,
      required: true,
      enum: ['queued', 'dispatched', 'running', 'retrying', 'completed', 'failed', 'canceled'],
      index: true,
    },
    attemptCount: { type: Number, default: 0, min: 0 },
    maxAttempts: { type: Number, default: 2, min: 1, max: 10 },
    nextAttemptAt: { type: Date },
    scheduledFor: { type: Date },
    dispatchedAt: { type: Date },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    heartbeatAt: { type: Date, index: true },
    lastOutputAt: { type: Date },
    cancelRequestedAt: { type: Date, index: true },
    lastError: { type: String, maxlength: 10_000 },
    exitCode: { type: Number },
    workerPid: { type: Number },
    childPid: { type: Number },
  },
  { timestamps: true }
);

AIRunnerJobSchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });
AIRunnerJobSchema.index({ scheduleId: 1, scheduledFor: 1 }, { unique: true, sparse: true });

const AIRunnerJob: Model<IAIRunnerJob> =
  mongoose.models.AIRunnerJob || mongoose.model<IAIRunnerJob>('AIRunnerJob', AIRunnerJobSchema);

export default AIRunnerJob;
