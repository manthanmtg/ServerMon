import type { PythonEnvironmentSelection } from '@/modules/python-environments/types';
import mongoose, { Schema, type Model } from 'mongoose';
import {
  SCRIPT_LANGUAGES,
  type CalendarSchedule,
  type EnvironmentLinks,
  type RunStatus,
  type ScriptDraft,
  type ScriptLanguage,
  type ScriptRunnerDefaults,
  type ScriptRetention,
  type ScriptSchedule,
} from '@/modules/script-runner/types';

type StoredDraft = Omit<
  ScriptDraft,
  'language' | 'env' | 'folder' | 'pythonEnvironmentId' | keyof EnvironmentLinks
> & {
  language?: ScriptLanguage;
  environmentSeal?: string | null;
};

export interface ScriptRecord extends StoredDraft, EnvironmentLinks {
  pythonEnvironmentId?: string | null;
  folder?: string;
  _id: string;
  host: string;
  updatedAt: Date;
  schedule?: ScheduleRecord;
  retention?: ScriptRetention;
}

export interface ScheduleRecord extends Pick<
  ScriptSchedule,
  'enabled' | 'lastOutcome' | 'lastError'
> {
  intervalMinutes?: number;
  calendar?: CalendarSchedule;
  requestedBy: string;
  nextRunAt?: Date;
  lastAttemptAt?: Date;
  pendingRunId?: string;
  pendingScheduledFor?: Date;
}

export interface RunRecord extends StoredDraft {
  pythonEnvironment?: PythonEnvironmentSelection;
  linkedEnvironmentSeal?: string | null;
  _id: string;
  host: string;
  scriptId?: string;
  requestedBy: string;
  scheduledFor?: Date;
  status: RunStatus | 'queued_linked' | 'queued_python';
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

export interface SettingsRecord extends Partial<ScriptRunnerDefaults> {
  _id: string;
  workerSeenAt?: Date;
  workerId?: string;
  workerCapabilityId?: string;
  workerProtocol?: number;
  workerRuntimes?: ScriptLanguage[];
  workerLinkedEnvironmentId?: string;
  linkMutationId?: string;
  linkMutationUntil?: Date;
  historyPruneVersion?: number;
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

const calendarSchema = new Schema<CalendarSchedule>(
  { frequency: { type: String, enum: ['daily', 'weekdays'] }, time: String, timeZone: String },
  { _id: false }
);

const scheduleSchema = new Schema<ScheduleRecord>(
  {
    intervalMinutes: Number,
    calendar: calendarSchema,
    enabled: { type: Boolean, required: true },
    requestedBy: { type: String, required: true },
    nextRunAt: Date,
    lastAttemptAt: Date,
    lastOutcome: String,
    lastError: String,
    pendingRunId: String,
    pendingScheduledFor: Date,
  },
  { _id: false }
);

const retentionSchema = new Schema<ScriptRetention>(
  { logRetentionDays: Number, historyRetentionDays: Number, maxHistoryRuns: Number },
  { _id: false }
);

const scriptSchema = new Schema<ScriptRecord>(
  {
    ...draft,
    folder: String,
    envVarIds: [String],
    envGroupIds: [String],
    pythonEnvironmentId: String,
    schedule: scheduleSchema,
    retention: retentionSchema,
  },
  { timestamps: true, versionKey: false }
);
scriptSchema.index({ host: 1, envVarIds: 1 });
scriptSchema.index({ host: 1, envGroupIds: 1 });
scriptSchema.index({ host: 1, pythonEnvironmentId: 1 });
scriptSchema.index({ host: 1, title: 1, _id: 1 });
scriptSchema.index({ host: 1, 'schedule.enabled': 1, 'schedule.nextRunAt': 1 });
scriptSchema.index({ host: 1, 'schedule.enabled': 1, 'schedule.lastOutcome': 1 });

const pythonSelectionSchema = new Schema<PythonEnvironmentSelection>(
  { environmentId: String, revisionId: String, name: String, pythonVersion: String },
  { _id: false }
);

const runSchema = new Schema<RunRecord>(
  {
    ...draft,
    scriptId: String,
    pythonEnvironment: pythonSelectionSchema,
    linkedEnvironmentSeal: { type: String, select: false },
    requestedBy: { type: String, required: true },
    scheduledFor: Date,
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
runSchema.index({ host: 1, scriptId: 1, status: 1, scheduledFor: 1 });
runSchema.index({ host: 1, scriptId: 1, createdAt: -1, _id: -1 });
runSchema.index({
  host: 1,
  'pythonEnvironment.environmentId': 1,
  status: 1,
  'pythonEnvironment.revisionId': 1,
});

const settingsSchema = new Schema<SettingsRecord>(
  {
    _id: { type: String, required: true },
    logRetentionDays: Number,
    historyRetentionDays: Number,
    maxHistoryRuns: Number,
    maxConcurrentRuns: Number,
    defaultTimeoutSeconds: Number,
    defaultWorkingDirectory: String,
    workerSeenAt: Date,
    workerId: String,
    workerCapabilityId: String,
    workerProtocol: Number,
    workerRuntimes: { type: [String], enum: SCRIPT_LANGUAGES, default: undefined },
    workerLinkedEnvironmentId: String,
    linkMutationId: { type: String, select: false },
    linkMutationUntil: { type: Date, select: false },
    historyPruneVersion: Number,
  },
  { versionKey: false }
);

export interface VariableRecord {
  _id: string;
  host: string;
  key: string;
  secret: boolean;
  valueSeal: string;
  updatedAt: Date;
}

const variableSchema = new Schema<VariableRecord>(
  {
    _id: { type: String, required: true },
    host: { type: String, required: true },
    key: { type: String, required: true },
    secret: { type: Boolean, required: true },
    valueSeal: { type: String, required: true, select: false },
  },
  { timestamps: true, versionKey: false }
);
variableSchema.index({ host: 1, key: 1 }, { unique: true });

export interface EnvGroupRecord {
  _id: string;
  host: string;
  name: string;
  nameKey: string;
  variableIds: string[];
}

const envGroupSchema = new Schema<EnvGroupRecord>(
  {
    _id: { type: String, required: true },
    host: { type: String, required: true },
    name: { type: String, required: true },
    nameKey: { type: String, required: true },
    variableIds: { type: [String], required: true },
  },
  { versionKey: false }
);
envGroupSchema.index({ host: 1, nameKey: 1 }, { unique: true });
envGroupSchema.index({ host: 1, variableIds: 1 });

function model<T>(name: string, schema: Schema<T>): Model<T> {
  return (mongoose.models[name] as Model<T> | undefined) ?? mongoose.model<T>(name, schema);
}

export const ScriptRunnerScript = model('ScriptRunnerScript', scriptSchema);
export const ScriptRunnerRun = model('ScriptRunnerRun', runSchema);
export const ScriptRunnerSettings = model('ScriptRunnerSettings', settingsSchema);
export const ScriptRunnerVariable = model('ScriptRunnerVariable', variableSchema);
export const ScriptRunnerEnvGroup = model('ScriptRunnerEnvGroup', envGroupSchema);
