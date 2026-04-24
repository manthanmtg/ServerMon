import mongoose, { Schema, Document, Model } from 'mongoose';
import { z } from 'zod';

const KindZ = z.enum(['client', 'route']);
const StepStatusZ = z.enum(['pass', 'fail', 'unknown']);
const SummaryZ = z.enum(['pass', 'fail', 'partial']);

export const DiagnosticRunZodSchema = z.object({
  kind: KindZ,
  targetId: z.string().min(1),
  steps: z
    .array(
      z.object({
        step: z.string().min(1),
        status: StepStatusZ,
        evidence: z.string().optional(),
        likelyCause: z.string().optional(),
        recommendedFix: z.string().optional(),
        durationMs: z.number().int().min(0).optional(),
      })
    )
    .default([]),
  summary: SummaryZ.optional(),
  startedAt: z.date().default(() => new Date()),
  finishedAt: z.date().optional(),
  initiatedBy: z.string().optional(),
  sanitizedReportExportable: z.boolean().default(true),
  error: z.string().optional(),
});

export type IDiagnosticRunDTO = z.infer<typeof DiagnosticRunZodSchema>;

export interface IDiagnosticRun extends Document, IDiagnosticRunDTO {
  _id: mongoose.Types.ObjectId;
}

const StepSub = new Schema(
  {
    step: { type: String, required: true },
    status: {
      type: String,
      enum: ['pass', 'fail', 'unknown'],
      required: true,
    },
    evidence: { type: String },
    likelyCause: { type: String },
    recommendedFix: { type: String },
    durationMs: { type: Number },
  },
  { _id: false }
);

const DiagnosticRunSchema = new Schema(
  {
    kind: { type: String, enum: ['client', 'route'], required: true },
    targetId: { type: String, required: true },
    steps: [StepSub],
    summary: { type: String, enum: ['pass', 'fail', 'partial'] },
    startedAt: { type: Date, default: () => new Date() },
    finishedAt: { type: Date },
    initiatedBy: { type: String },
    sanitizedReportExportable: { type: Boolean, default: true },
    error: { type: String },
  },
  { timestamps: true }
);

DiagnosticRunSchema.index({ kind: 1, targetId: 1, createdAt: -1 });

const DiagnosticRun: Model<IDiagnosticRun> =
  (mongoose.models.DiagnosticRun as Model<IDiagnosticRun>) ||
  mongoose.model<IDiagnosticRun>('DiagnosticRun', DiagnosticRunSchema);

export default DiagnosticRun;
