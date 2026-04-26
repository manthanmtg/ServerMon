export interface UpdateRunStatus {
  runId: string;
  timestamp: string;
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
