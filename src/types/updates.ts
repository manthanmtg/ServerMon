export interface UpdateRunStatus {
  runId: string;
  timestamp: string;
  status: 'running' | 'completed' | 'failed';
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
