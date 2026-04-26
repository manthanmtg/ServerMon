import mongoose, { Document, Model, Schema } from 'mongoose';
import type { AIRunnerAutoflowStatus, AIRunnerAutoflowItemStatus } from '@/modules/ai-runner/types';

export interface IAIRunnerAutoflowItem {
  _id?: mongoose.Types.ObjectId;
  name: string;
  promptId?: mongoose.Types.ObjectId;
  promptContent?: string;
  promptType: 'inline' | 'file-reference';
  attachments?: {
    name: string;
    path: string;
    contentType: string;
    size: number;
  }[];
  agentProfileId: mongoose.Types.ObjectId;
  workspaceId?: mongoose.Types.ObjectId;
  workingDirectory: string;
  timeout: number;
  status: AIRunnerAutoflowItemStatus;
  runId?: mongoose.Types.ObjectId;
  lastError?: string;
  startedAt?: Date;
  finishedAt?: Date;
}

export interface IAIRunnerAutoflow extends Document {
  name: string;
  description?: string;
  mode: 'sequential' | 'parallel';
  status: AIRunnerAutoflowStatus;
  continueOnFailure: boolean;
  currentIndex: number;
  items: IAIRunnerAutoflowItem[];
  startedAt?: Date;
  finishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AIRunnerAutoflowItemSchema = new Schema<IAIRunnerAutoflowItem>(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    promptId: { type: Schema.Types.ObjectId, ref: 'AIRunnerPrompt' },
    promptContent: { type: String, maxlength: 100_000 },
    promptType: {
      type: String,
      required: true,
      enum: ['inline', 'file-reference'],
      default: 'inline',
    },
    attachments: {
      type: [
        {
          name: { type: String, required: true, trim: true, maxlength: 255 },
          path: { type: String, required: true, trim: true, maxlength: 2000 },
          contentType: { type: String, required: true, trim: true, maxlength: 255 },
          size: { type: Number, required: true, min: 0, max: 5 * 1024 * 1024 },
          _id: false,
        },
      ],
      default: [],
    },
    agentProfileId: { type: Schema.Types.ObjectId, ref: 'AIRunnerProfile', required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'AIRunnerWorkspace' },
    workingDirectory: { type: String, required: true, trim: true, maxlength: 2000 },
    timeout: { type: Number, required: true, min: 1, max: 24 * 60 },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'queued', 'running', 'completed', 'failed', 'skipped', 'canceled'],
      default: 'pending',
    },
    runId: { type: Schema.Types.ObjectId, ref: 'AIRunnerRun' },
    lastError: { type: String, maxlength: 10_000 },
    startedAt: { type: Date },
    finishedAt: { type: Date },
  },
  { _id: true }
);

const AIRunnerAutoflowSchema = new Schema<IAIRunnerAutoflow>(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 1000 },
    mode: { type: String, required: true, enum: ['sequential', 'parallel'], default: 'sequential' },
    status: {
      type: String,
      required: true,
      enum: ['draft', 'running', 'completed', 'failed', 'canceled'],
      default: 'draft',
      index: true,
    },
    continueOnFailure: { type: Boolean, default: false },
    currentIndex: { type: Number, default: 0, min: 0 },
    items: { type: [AIRunnerAutoflowItemSchema], default: [] },
    startedAt: { type: Date },
    finishedAt: { type: Date },
  },
  { timestamps: true }
);

AIRunnerAutoflowSchema.index({ status: 1, updatedAt: -1 });

const AIRunnerAutoflow: Model<IAIRunnerAutoflow> =
  mongoose.models.AIRunnerAutoflow ||
  mongoose.model<IAIRunnerAutoflow>('AIRunnerAutoflow', AIRunnerAutoflowSchema);

export default AIRunnerAutoflow;
