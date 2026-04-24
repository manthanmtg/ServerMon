import mongoose, { Schema, Document, Model } from 'mongoose';
import { z } from 'zod';

const TargetsModeZ = z.enum(['fleet', 'tag', 'node', 'list']);
const VersionSourceZ = z.enum(['github', 'registry', 'custom']);
const JobStatusZ = z.enum(['pending', 'running', 'paused', 'completed', 'failed', 'cancelled']);
const PerNodeStatusZ = z.enum([
  'pending',
  'running',
  'succeeded',
  'failed',
  'rolledBack',
  'skipped',
]);

export const AgentUpdateJobZodSchema = z.object({
  targets: z.object({
    mode: TargetsModeZ,
    ids: z.array(z.string()).optional(),
    tag: z.string().optional(),
  }),
  versionTarget: z.string().min(1),
  versionSource: VersionSourceZ.default('github'),
  strategy: z
    .object({
      batchSize: z.number().int().min(1).default(5),
      pauseOnFailure: z.boolean().default(true),
      autoStopThresholdPct: z.number().int().min(0).max(100).default(30),
    })
    .default({ batchSize: 5, pauseOnFailure: true, autoStopThresholdPct: 30 }),
  status: JobStatusZ.default('pending'),
  perNode: z
    .array(
      z.object({
        nodeId: z.string(),
        status: PerNodeStatusZ,
        startedAt: z.date().optional(),
        finishedAt: z.date().optional(),
        versionBefore: z.string().optional(),
        versionAfter: z.string().optional(),
        logs: z.string().optional(),
        rollbackAvailable: z.boolean().optional(),
        error: z.string().optional(),
      })
    )
    .default([]),
  initiatedBy: z.string().optional(),
  startedAt: z.date().optional(),
  finishedAt: z.date().optional(),
  pausedAt: z.date().optional(),
  cancelledAt: z.date().optional(),
  error: z.string().optional(),
});

export type IAgentUpdateJobDTO = z.infer<typeof AgentUpdateJobZodSchema>;

export interface IAgentUpdateJob extends Document, IAgentUpdateJobDTO {
  _id: mongoose.Types.ObjectId;
}

const PerNodeSub = new Schema(
  {
    nodeId: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'running', 'succeeded', 'failed', 'rolledBack', 'skipped'],
      required: true,
    },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    versionBefore: { type: String },
    versionAfter: { type: String },
    logs: { type: String },
    rollbackAvailable: { type: Boolean },
    error: { type: String },
  },
  { _id: false }
);

const AgentUpdateJobSchema = new Schema(
  {
    targets: {
      mode: {
        type: String,
        enum: ['fleet', 'tag', 'node', 'list'],
        required: true,
      },
      ids: [{ type: String }],
      tag: { type: String },
    },
    versionTarget: { type: String, required: true },
    versionSource: {
      type: String,
      enum: ['github', 'registry', 'custom'],
      default: 'github',
    },
    strategy: {
      batchSize: { type: Number, default: 5 },
      pauseOnFailure: { type: Boolean, default: true },
      autoStopThresholdPct: { type: Number, default: 30 },
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'paused', 'completed', 'failed', 'cancelled'],
      default: 'pending',
    },
    perNode: [PerNodeSub],
    initiatedBy: { type: String },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    pausedAt: { type: Date },
    cancelledAt: { type: Date },
    error: { type: String },
  },
  { timestamps: true }
);

AgentUpdateJobSchema.index({ status: 1, createdAt: -1 });

const AgentUpdateJob: Model<IAgentUpdateJob> =
  (mongoose.models.AgentUpdateJob as Model<IAgentUpdateJob>) ||
  mongoose.model<IAgentUpdateJob>('AgentUpdateJob', AgentUpdateJobSchema);

export default AgentUpdateJob;
