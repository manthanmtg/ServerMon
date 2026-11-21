export type UpdateRunType = 'servermon' | 'agent' | 'packages' | 'combined' | 'unknown';
export type UpdateRunTrigger = 'manual' | 'scheduled';
export type LocalAutoUpdateTarget = 'servermon' | 'agent';

export interface UpdateRunStatus {
  runId: string;
  timestamp: string;
  type?: UpdateRunType;
  trigger?: UpdateRunTrigger;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  pid: number;
  exitCode: number | null;
  startedAt: string;
  finishedAt?: string;
  logContent?: string;
}

export interface ServermonAgentStatus {
  serviceName: string;
  installed: boolean;
  active: boolean;
  enabled: boolean;
  installMode?: 'release' | 'source' | 'unknown';
  versionTarget?: string;
  loadState?: string;
  activeState?: string;
  unitFileState?: string;
  fragmentPath?: string;
  repoDir?: string;
  updateSupported: boolean;
  message?: string;
}

export interface LocalAutoUpdateSettings {
  enabled: boolean;
  time: string;
  timezone: string;
  missedRunGraceMinutes?: number;
  missedRunMaxRetries?: number;
  lastRunStatus?: UpdateRunStatus['status'];
  lastRunAt?: string;
  lastRunMessage?: string;
}

export interface LocalAutoUpdateScheduleState {
  enabled: boolean;
  nextRunAt: string | null;
  localDate: string;
  localTime: string;
  timezone: string;
}
