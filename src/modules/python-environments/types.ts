export interface PythonInterpreter {
  id: string;
  version: string;
}

export interface PythonInterpreterInstall {
  version: string;
  status: 'queued' | 'installing' | 'ready' | 'failed';
  error?: string;
}

export interface PythonPackage {
  name: string;
  version: string;
}

export interface PythonEnvironmentOption {
  id: string;
  name: string;
  pythonVersion: string;
}

export interface PythonEnvironmentSelection {
  environmentId: string;
  revisionId: string;
  name: string;
  pythonVersion: string;
}

export type PythonBuildStage =
  | 'queued'
  | 'creating'
  | 'installing'
  | 'checking'
  | 'ready'
  | 'failed'
  | 'removing'
  | 'pruned';

export interface PythonRevision {
  id: string;
  stage: PythonBuildStage;
  createdAt: string;
  finishedAt?: string;
  pythonVersion?: string;
  requirements?: string;
  packages?: PythonPackage[];
  packageCount?: number;
  diskBytes?: number;
  log?: string;
  error?: string;
}

export interface PythonEnvironmentSummary {
  id: string;
  name: string;
  interpreterId: string;
  active?: PythonRevision;
  latest?: PythonRevision;
  scriptsCount: number;
  diskBytes: number;
  deleting?: boolean;
  deleteError?: string;
}

export interface PythonEnvironmentDetail extends PythonEnvironmentSummary {
  requirements: string;
  revisions: PythonRevision[];
  consumers: Array<{ id: string; title: string; scheduled: boolean }>;
}

export interface PythonEnvironmentOverview {
  online: boolean;
  supported: boolean;
  workerError?: string;
  interpreters: PythonInterpreter[];
  interpreterInstalls: PythonInterpreterInstall[];
  environments: PythonEnvironmentSummary[];
}
