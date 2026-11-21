import mongoose, { Schema, type Model } from 'mongoose';
import type {
  PythonBuildStage,
  PythonInterpreter,
  PythonInterpreterInstall,
  PythonPackage,
} from '@/modules/python-environments/types';

export interface PythonRevisionRecord {
  id: string;
  stage: PythonBuildStage;
  createdAt: Date;
  finishedAt?: Date;
  pythonVersion?: string;
  requirements: string;
  packages?: PythonPackage[];
  packageCount?: number;
  diskBytes?: number;
  log?: string;
  error?: string;
}

export interface PythonEnvironmentRecord {
  _id: string;
  host: string;
  name: string;
  nameKey: string;
  interpreterId: string;
  activeRevisionId?: string;
  deleting?: boolean;
  deleteError?: string;
  revisions: PythonRevisionRecord[];
}

export interface PythonWorkerRecord {
  _id: string;
  workerId: string;
  seenAt: Date;
  interpreters: PythonInterpreter[];
  error?: string;
}

export interface PythonInterpreterInstallRecord extends PythonInterpreterInstall {
  _id: string;
  host: string;
  requestedAt: Date;
  finishedAt?: Date;
}

const packages = new Schema<PythonPackage>({ name: String, version: String }, { _id: false });
const revision = new Schema<PythonRevisionRecord>(
  {
    id: String,
    stage: String,
    createdAt: Date,
    finishedAt: Date,
    pythonVersion: String,
    requirements: String,
    packages: { type: [packages], default: undefined },
    packageCount: Number,
    diskBytes: Number,
    log: String,
    error: String,
  },
  { _id: false }
);

const environment = new Schema<PythonEnvironmentRecord>(
  {
    _id: String,
    host: String,
    name: String,
    nameKey: String,
    interpreterId: String,
    activeRevisionId: String,
    deleting: Boolean,
    deleteError: String,
    revisions: [revision],
  },
  { versionKey: false }
);
environment.index({ host: 1, nameKey: 1 }, { unique: true });
environment.index({ host: 1, 'revisions.stage': 1 });

const interpreter = new Schema<PythonInterpreter>({ id: String, version: String }, { _id: false });
const worker = new Schema<PythonWorkerRecord>(
  {
    _id: String,
    workerId: String,
    seenAt: Date,
    interpreters: [interpreter],
    error: String,
  },
  { versionKey: false }
);

export const PythonEnvironment: Model<PythonEnvironmentRecord> =
  (mongoose.models.PythonEnvironment as Model<PythonEnvironmentRecord> | undefined) ??
  mongoose.model<PythonEnvironmentRecord>('PythonEnvironment', environment);
export const PythonEnvironmentWorker: Model<PythonWorkerRecord> =
  (mongoose.models.PythonEnvironmentWorker as Model<PythonWorkerRecord> | undefined) ??
  mongoose.model<PythonWorkerRecord>('PythonEnvironmentWorker', worker);

const install = new Schema<PythonInterpreterInstallRecord>(
  {
    _id: String,
    host: String,
    version: String,
    status: String,
    error: String,
    requestedAt: Date,
    finishedAt: Date,
  },
  { versionKey: false }
);
install.index({ host: 1, status: 1, requestedAt: 1 });
export const PythonInterpreterInstallJob: Model<PythonInterpreterInstallRecord> =
  (mongoose.models.PythonInterpreterInstallJob as
    | Model<PythonInterpreterInstallRecord>
    | undefined) ??
  mongoose.model<PythonInterpreterInstallRecord>('PythonInterpreterInstallJob', install);
