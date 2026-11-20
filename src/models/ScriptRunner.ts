import mongoose, { Schema, type Model } from 'mongoose';
import {
  SCRIPT_LANGUAGES,
  type RunStatus,
  type ScriptDraft,
  type ScriptLanguage,
} from '@/modules/script-runner/types';

type StoredDraft = Omit<ScriptDraft, 'language' | 'env'> & {
  language?: ScriptLanguage;
  environmentSeal?: string | null;
};

export interface ScriptRecord extends StoredDraft {
  _id: string;
  host: string;
  updatedAt: Date;
}

export interface RunRecord extends StoredDraft {
  _id: string;
  host: string;
  scriptId?: string;
  requestedBy: string;
  status: RunStatus;
  createdAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
  exitCode?: number | null;
  signal?: number | null;
  message?: string;
  stopRequestedAt?: Date;
  outputTruncated?: boolean;
  logsPurgedAt?: Date;
}

interface SettingsRecord {
  _id: string;
  logRetentionDays?: number;
  workerSeenAt?: Date;
  workerId?: string;
  workerCapabilityId?: string;
  workerProtocol?: number;
  workerRuntimes?: ScriptLanguage[];
}

const draft = {
  _id: { type: String, required: true },
  host: { type: String, required: true },
  title: { type: String, required: true },
  source: { type: String, required: true, select: false },
  language: { type: String, enum: SCRIPT_LANGUAGES },
  environmentSeal: { type: String, select: false },
  cwd: { type: String, required: true },
  args: [{ type: String }],
  timeoutSeconds: { type: Number, required: true },
};

const scriptSchema = new Schema<ScriptRecord>(draft, { timestamps: true, versionKey: false });
scriptSchema.index({ host: 1, title: 1, _id: 1 });

const runSchema = new Schema<RunRecord>(
  {
    ...draft,
    scriptId: String,
    requestedBy: { type: String, required: true },
    status: { type: String, required: true },
    createdAt: { type: Date, required: true },
    startedAt: Date,
    finishedAt: Date,
    exitCode: Number,
    signal: Number,
    message: String,
    stopRequestedAt: Date,
    outputTruncated: Boolean,
    logsPurgedAt: Date,
  },
  { versionKey: false }
);
runSchema.index({ host: 1, status: 1, createdAt: 1, _id: 1 });
runSchema.index({ host: 1, createdAt: -1, _id: -1 });
runSchema.index({ host: 1, logsPurgedAt: 1, finishedAt: 1 });

const settingsSchema = new Schema<SettingsRecord>(
  {
    _id: { type: String, required: true },
    logRetentionDays: Number,
    workerSeenAt: Date,
    workerId: String,
    workerCapabilityId: String,
    workerProtocol: Number,
    workerRuntimes: { type: [String], enum: SCRIPT_LANGUAGES, default: undefined },
  },
  { versionKey: false }
);

function model<T>(name: string, schema: Schema<T>): Model<T> {
  return (mongoose.models[name] as Model<T> | undefined) ?? mongoose.model<T>(name, schema);
}

export const ScriptRunnerScript = model('ScriptRunnerScript', scriptSchema);
export const ScriptRunnerRun = model('ScriptRunnerRun', runSchema);
export const ScriptRunnerSettings = model('ScriptRunnerSettings', settingsSchema);
